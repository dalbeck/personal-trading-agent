import {
  getLatestPrice,
  getStockBars,
  hasAlpacaCredentials,
} from "@/lib/server/alpaca";
import { readLatestSnapshot } from "@/lib/server/data";
import { getSymbolResearch } from "@/lib/server/symbol-research";
import { rangeWindow } from "@/lib/server/symbol";
import { recordManualProposal } from "@/lib/server/writers";
import {
  runRedTeam,
  type RedTeamExec,
  type RedTeamProposal,
} from "@/lib/server/red-team";
import {
  evaluateOrder,
  type ProposedOrder,
  type RiskContext,
  type Violation,
} from "@/lib/risk";
import {
  buildManualProposalDraft,
  type BuilderCatalystType,
  type ManualProposalDraft,
} from "@/lib/proposal-builder";
import type { Ohlc } from "@/lib/indicators";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";
import { TradeProposalSchema } from "@/lib/schemas";
import type {
  CashFlowQuality,
  ProposalLensBreakdown,
  RedTeamVerdict,
  TradeProposal,
} from "@/lib/types";

/**
 * On-demand "analyze a symbol" pipeline (Phase 3 M2). Runs the **full pipeline**
 * for a human-entered ticker — research (Alpaca technicals + best-effort capped
 * Perplexity context) → build a technically-anchored proposal → **risk rails →
 * red-team** → persist as a review candidate tagged `manual-request`. It is
 * **user-initiated and bounded**: it places nothing, every proposal still clears
 * the gates (a weak pick is flagged, not rubber-stamped), and a live request is
 * approvable through the same gated path (gate closed → dry-run sink).
 *
 * All side-effecting steps are injectable seams so it is tested without the
 * network, the metered research API, or a broker. The deterministic builder can
 * later be swapped for an LLM analyst behind the same seam.
 */

/** A one-line catalyst + bucket derived from research (best-effort). */
export interface ResearchContext {
  sector: string | null;
  catalyst: string | null;
  catalystType: BuilderCatalystType | null;
  /** Cash-flow quality for the value lens (value-cashflow M1) — pulled from the
   *  SAME capped research fetch (no extra call). Attached to the value lens only;
   *  null when off/capped/unavailable. */
  cashFlow: CashFlowQuality | null;
  /** True when the metered Perplexity provider supplied the context (for the
   *  caller to surface that a daily-capped call was spent). */
  usedPerplexity: boolean;
}

export interface AnalyzeSymbolOpts {
  account?: "paper" | "live";
  now?: () => Date;
  dataDir?: string;
  // Seams (default to the real fetchers).
  fetchBars?: (symbol: string) => Promise<Ohlc[]>;
  /** Current-quote seam (fresh-entry-levels M1) — the entry anchor. Defaults to a
   *  live Alpaca read; null when off/unavailable (then the builder falls back to
   *  the last bar close). */
  fetchQuote?: (symbol: string) => Promise<number | null>;
  fetchResearch?: (symbol: string) => Promise<ResearchContext>;
  readSnapshot?: (
    account: "paper" | "live",
  ) => Promise<{ equity: number; highWaterEquity: number; openPositions: RiskContext["openPositions"] } | null>;
  redTeamExec?: RedTeamExec;
}

export type AnalyzeSymbolResult =
  | {
      ok: true;
      proposal: TradeProposal;
      risk: { ok: boolean; violations: Violation[] };
      redTeam: RedTeamVerdict;
      usedPerplexity: boolean;
    }
  | {
      ok: false;
      code: "invalid-symbol" | "no-snapshot" | "insufficient-data";
      error: string;
    };

const ONE_YEAR_BARS = (symbol: string, now: Date): Promise<Ohlc[]> => {
  const win = rangeWindow("1Y", now);
  return getStockBars(symbol, win).catch(() => []);
};

/** Default research seam: Alpaca prices are separate; this pulls the
 *  fundamentals/sector + AI summary (capped) and maps a one-line catalyst. */
async function defaultResearch(
  symbol: string,
  dataDir?: string,
): Promise<ResearchContext> {
  try {
    const r = await getSymbolResearch(symbol, { dataDir });
    const summary = r.summary?.trim();
    return {
      sector: r.profile?.sector ?? null,
      // The desk's identity is technical; research catalyst is a check only. A
      // trimmed AI summary becomes the one-line "why now" when present, else
      // null (honestly flagged weak by the red-team).
      catalyst: summary ? summary.slice(0, 180) : null,
      catalystType: summary ? "other" : null,
      cashFlow: r.cashFlow ?? null,
      usedPerplexity: r.perplexity === "ok",
    };
  } catch {
    return {
      sector: null,
      catalyst: null,
      catalystType: null,
      cashFlow: null,
      usedPerplexity: false,
    };
  }
}

export async function defaultSnapshot(account: "paper" | "live") {
  const snap = await readLatestSnapshot(account);
  if (!snap) return null;
  const highWaterEquity = Math.max(
    snap.equity,
    ...snap.equityCurve.map((p) => p.equity),
    0,
  );
  return {
    equity: snap.equity,
    highWaterEquity,
    openPositions: snap.positions.map((p) => ({
      symbol: p.symbol,
      marketValue: p.marketValue,
      sector: null,
    })),
  };
}

function toOrder(p: TradeProposal): ProposedOrder {
  return {
    symbol: p.symbol,
    action: p.action,
    side: p.side,
    qty: p.qty,
    limitPrice: p.limitPrice,
    orderType: "marketable_limit",
    stopPrice: p.stopPrice,
    assetClass: "equity",
    takeProfit: p.takeProfit,
    sector: p.sector ?? null,
  };
}

/** Brief the red-team prosecutor for one lens's draft, under its own mandate.
 *  Cash-flow quality is briefed for the **value** lens only (value-cashflow M1) —
 *  the prosecutor weighs strong FCF as floor support and weak/declining FCF +
 *  rising leverage as a value-trap flag. Exported so the "Refresh levels"
 *  re-anchor reuses the exact same briefing. */
export function redTeamInput(
  d: ManualProposalDraft,
  cashFlow: CashFlowQuality | null,
): RedTeamProposal {
  return {
    symbol: d.symbol,
    action: d.action,
    side: d.side,
    strategy: d.strategy,
    qty: d.qty,
    limitPrice: d.limitPrice,
    stopPrice: d.stopPrice,
    takeProfit: d.takeProfit,
    targetType: d.targetType,
    relativeVolume: d.relativeVolume,
    catalyst: d.catalyst,
    catalystType: d.catalystType,
    cashFlow: d.strategy === "value" ? cashFlow : null,
    thesis: d.thesis,
    reasoning: d.reasoning,
  };
}

/** Turn a lens's draft + its red-team verdict into a persisted lens breakdown.
 *  Cash-flow quality is a **value-lens** signal (value-cashflow M1) — it is
 *  attached to the value lens only; the trend lens carries null. Exported so the
 *  "Refresh levels" re-anchor builds lenses identically. */
export function draftToLens(
  d: ManualProposalDraft,
  redTeam: RedTeamVerdict,
  cashFlow: CashFlowQuality | null,
): ProposalLensBreakdown {
  return {
    strategy: d.strategy,
    limitPrice: d.limitPrice,
    stopPrice: d.stopPrice,
    takeProfit: d.takeProfit,
    targetType: d.targetType,
    qty: d.qty,
    riskPct: d.riskPct,
    relativeVolume: d.relativeVolume,
    catalyst: d.catalyst,
    catalystType: d.catalystType,
    convictionScore: d.convictionScore,
    convictionTier: d.convictionTier,
    confidence: d.confidence,
    thesis: d.thesis,
    reasoning: d.reasoning,
    redTeam,
    cashFlow: d.strategy === "value" ? cashFlow : null,
  };
}

export async function analyzeSymbol(
  rawSymbol: string,
  opts: AnalyzeSymbolOpts = {},
): Promise<AnalyzeSymbolResult> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!isValidSymbol(symbol)) {
    return { ok: false, code: "invalid-symbol", error: "Enter a valid ticker." };
  }

  const account = opts.account ?? "live";
  const now = opts.now?.() ?? new Date();
  const dataDir = opts.dataDir;

  const fetchBars =
    opts.fetchBars ??
    ((s: string) =>
      hasAlpacaCredentials() ? ONE_YEAR_BARS(s, now) : Promise.resolve([]));
  const fetchQuote =
    opts.fetchQuote ??
    ((s: string) =>
      hasAlpacaCredentials()
        ? getLatestPrice(s).catch(() => null)
        : Promise.resolve(null));
  const fetchResearch =
    opts.fetchResearch ?? ((s: string) => defaultResearch(s, dataDir));
  const readSnapshot = opts.readSnapshot ?? defaultSnapshot;

  const [bars, quote, snapshot, research] = await Promise.all([
    fetchBars(symbol),
    fetchQuote(symbol),
    readSnapshot(account),
    fetchResearch(symbol),
  ]);

  if (!snapshot) {
    return {
      ok: false,
      code: "no-snapshot",
      error: `No ${account} snapshot — can't size against an unknown account. Refresh the account first.`,
    };
  }

  // Dual-lens (M1): evaluate the SAME symbol under BOTH the trend and value
  // mandates and produce ONE proposal holding both breakdowns. Research is
  // fetched once and shared (so the Perplexity cap is respected); each lens gets
  // its own deterministic draft and its own cross-model red-team verdict.
  const researchInput = {
    symbol,
    bars,
    // Anchor BOTH lenses to the SAME current quote (fresh-entry-levels M1).
    quote,
    equity: snapshot.equity,
    sector: research.sector,
    catalyst: research.catalyst,
    catalystType: research.catalystType,
  };
  const trendDraft = buildManualProposalDraft({ ...researchInput, strategy: "trend" });
  const valueDraft = buildManualProposalDraft({ ...researchInput, strategy: "value" });
  if (!trendDraft || !valueDraft) {
    return {
      ok: false,
      code: "insufficient-data",
      error: `Not enough Alpaca price history to analyze ${symbol} (need ~30 daily bars). Prices are Alpaca-only.`,
    };
  }

  const createdAt = now.toISOString();
  // Unique PER RUN, not just per day (so two same-day analyses don't collide on
  // id → one `/proposals/[id]` URL + a duplicate React key).
  const id = `manual-${symbol}-${createdAt.slice(0, 23).replace(/[-:.T]/g, "")}`;
  const advisory = false; // approvable; the gate (not this) is the money boundary

  // Cash-flow quality (value-cashflow M1) — a VALUE-lens signal pulled from the
  // shared research fetch (no extra call). Attached to the value lens + briefed
  // to the value red-team only.
  const cashFlow = research.cashFlow;

  // Run each lens's red-team under its matching mandate.
  const [trendRedTeam, valueRedTeam] = await Promise.all([
    runRedTeam(redTeamInput(trendDraft, null), { exec: opts.redTeamExec }),
    runRedTeam(redTeamInput(valueDraft, cashFlow), { exec: opts.redTeamExec }),
  ]);

  const lenses: ProposalLensBreakdown[] = [
    draftToLens(trendDraft, trendRedTeam, null),
    draftToLens(valueDraft, valueRedTeam, cashFlow),
  ];

  // The proposal's top-level fields mirror the ACTIVE (default) lens — the
  // higher-conviction one (tie → trend). The human can toggle + approve under
  // the other on the detail page; the slim list shows this default.
  const active =
    valueDraft.convictionScore > trendDraft.convictionScore
      ? { draft: valueDraft, redTeam: valueRedTeam }
      : { draft: trendDraft, redTeam: trendRedTeam };
  // Top-level cash-flow mirrors the active lens — only carried when value is active.
  const activeCashFlow = active.draft.strategy === "value" ? cashFlow : null;

  const proposal: TradeProposal = TradeProposalSchema.parse({
    ...active.draft,
    id,
    createdAt,
    // Levels were anchored to the current quote at this analysis time.
    pricedAt: createdAt,
    account,
    advisory,
    origin: "manual-request",
    status: "pending",
    redTeam: active.redTeam,
    cashFlow: activeCashFlow,
    lenses,
  });

  // Risk rails — informational preview for the ACTIVE lens (the binding re-check
  // runs at approval, under whichever lens the human acts). SPY/VIX neutral here;
  // equity/positions are the snapshot's, so size/sector/concentration are real.
  const ctx: RiskContext = {
    equity: snapshot.equity,
    highWaterEquity: snapshot.highWaterEquity,
    openPositions: snapshot.openPositions,
    ordersToday: 0,
    spyIntradayChangePct: 0,
    vix: 15,
  };
  const risk = evaluateOrder(toOrder(proposal), ctx);

  await recordManualProposal(
    {
      id,
      createdAt,
      symbol: proposal.symbol,
      action: proposal.action,
      side: proposal.side,
      strategy: proposal.strategy,
      qty: proposal.qty,
      limitPrice: proposal.limitPrice,
      stopPrice: proposal.stopPrice,
      takeProfit: proposal.takeProfit,
      targetType: proposal.targetType,
      sector: proposal.sector,
      relativeVolume: proposal.relativeVolume,
      catalyst: proposal.catalyst,
      catalystType: proposal.catalystType,
      convictionScore: proposal.convictionScore,
      convictionTier: proposal.convictionTier,
      riskPct: proposal.riskPct,
      confidence: proposal.confidence,
      thesis: proposal.thesis,
      reasoning: proposal.reasoning,
      redTeam: active.redTeam,
      cashFlow: activeCashFlow,
      pricedAt: proposal.pricedAt,
      lenses,
    },
    { account, advisory },
    { dataDir },
  );

  return {
    ok: true,
    proposal,
    risk,
    redTeam: active.redTeam,
    usedPerplexity: research.usedPerplexity,
  };
}
