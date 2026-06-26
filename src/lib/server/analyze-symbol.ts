import { getStockBars, hasAlpacaCredentials } from "@/lib/server/alpaca";
import { readLatestSnapshot } from "@/lib/server/data";
import { getSymbolResearch } from "@/lib/server/symbol-research";
import { rangeWindow } from "@/lib/server/symbol";
import { recordManualProposal } from "@/lib/server/writers";
import { runRedTeam, type RedTeamExec } from "@/lib/server/red-team";
import {
  evaluateOrder,
  type ProposedOrder,
  type RiskContext,
  type Violation,
} from "@/lib/risk";
import {
  buildManualProposalDraft,
  type BuilderCatalystType,
} from "@/lib/proposal-builder";
import type { Ohlc } from "@/lib/indicators";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";
import { TradeProposalSchema } from "@/lib/schemas";
import type { Strategy } from "@/lib/strategy";
import type { RedTeamVerdict, TradeProposal } from "@/lib/types";

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
  /** True when the metered Perplexity provider supplied the context (for the
   *  caller to surface that a daily-capped call was spent). */
  usedPerplexity: boolean;
}

export interface AnalyzeSymbolOpts {
  account?: "paper" | "live";
  /** Which mandate the human chose to analyze under (value-sleeve M1). `trend`
   *  (default) runs the technical lens; `value` runs the value / mean-reversion
   *  lens — the proposal carries `strategy: "value"` and the red-team is briefed
   *  with the value mandate (counter-trend expected, value-trap hunted). */
  strategy?: Strategy;
  now?: () => Date;
  dataDir?: string;
  // Seams (default to the real fetchers).
  fetchBars?: (symbol: string) => Promise<Ohlc[]>;
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
      usedPerplexity: r.perplexity === "ok",
    };
  } catch {
    return { sector: null, catalyst: null, catalystType: null, usedPerplexity: false };
  }
}

async function defaultSnapshot(account: "paper" | "live") {
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

export async function analyzeSymbol(
  rawSymbol: string,
  opts: AnalyzeSymbolOpts = {},
): Promise<AnalyzeSymbolResult> {
  const symbol = normalizeSymbol(rawSymbol);
  if (!isValidSymbol(symbol)) {
    return { ok: false, code: "invalid-symbol", error: "Enter a valid ticker." };
  }

  const account = opts.account ?? "live";
  const strategy: Strategy = opts.strategy ?? "trend";
  const now = opts.now?.() ?? new Date();
  const dataDir = opts.dataDir;

  const fetchBars =
    opts.fetchBars ??
    ((s: string) =>
      hasAlpacaCredentials() ? ONE_YEAR_BARS(s, now) : Promise.resolve([]));
  const fetchResearch =
    opts.fetchResearch ?? ((s: string) => defaultResearch(s, dataDir));
  const readSnapshot = opts.readSnapshot ?? defaultSnapshot;

  const [bars, snapshot, research] = await Promise.all([
    fetchBars(symbol),
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

  const draft = buildManualProposalDraft({
    symbol,
    bars,
    equity: snapshot.equity,
    strategy,
    sector: research.sector,
    catalyst: research.catalyst,
    catalystType: research.catalystType,
  });
  if (!draft) {
    return {
      ok: false,
      code: "insufficient-data",
      error: `Not enough Alpaca price history to analyze ${symbol} (need ~30 daily bars). Prices are Alpaca-only.`,
    };
  }

  // Build the candidate proposal object so rails + red-team see the real order.
  const createdAt = now.toISOString();
  const id = `manual-${createdAt.slice(0, 10)}-${symbol}`;
  const advisory = false; // approvable; the gate (not this) is the money boundary
  const proposal: TradeProposal = TradeProposalSchema.parse({
    ...draft,
    id,
    createdAt,
    account,
    advisory,
    origin: "manual-request",
    status: "pending",
  });

  // Risk rails — informational preview at proposal time (the binding re-check
  // runs at approval). SPY/VIX use a neutral reading here; equity/positions are
  // the snapshot's, so the size/sector/concentration rails are real.
  const ctx: RiskContext = {
    equity: snapshot.equity,
    highWaterEquity: snapshot.highWaterEquity,
    openPositions: snapshot.openPositions,
    ordersToday: 0,
    spyIntradayChangePct: 0,
    vix: 15,
  };
  const risk = evaluateOrder(toOrder(proposal), ctx);

  // Red-team — the cross-model prosecutor; fails closed. A weak manual pick is
  // flagged here, never rubber-stamped.
  const redTeam = await runRedTeam(
    {
      symbol: proposal.symbol,
      action: proposal.action,
      side: proposal.side,
      strategy: proposal.strategy,
      qty: proposal.qty,
      limitPrice: proposal.limitPrice,
      stopPrice: proposal.stopPrice,
      takeProfit: proposal.takeProfit,
      targetType: proposal.targetType,
      relativeVolume: proposal.relativeVolume,
      catalyst: proposal.catalyst,
      catalystType: proposal.catalystType,
      thesis: proposal.thesis,
      reasoning: proposal.reasoning,
    },
    { exec: opts.redTeamExec },
  );

  // Persist the review candidate with the verdict attached, tagged manual-request.
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
      redTeam,
    },
    { account, advisory },
    { dataDir },
  );

  return {
    ok: true,
    proposal: { ...proposal, redTeam },
    risk,
    redTeam,
    usedPerplexity: research.usedPerplexity,
  };
}
