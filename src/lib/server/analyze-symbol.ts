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
import { railsForSleeve, sleeveRequiresStop } from "@strategy/sleeves.config";
import { sleeveOf, type Sleeve } from "@/lib/sleeves";
import {
  buildManualProposalDraft,
  buildCoreLongProposalDraft,
  type BuilderCatalystType,
  type ManualProposalDraft,
} from "@/lib/proposal-builder";
import type { Ohlc } from "@/lib/indicators";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";
import { TradeProposalSchema } from "@/lib/schemas";
import { assessDividendFloor } from "@/lib/dividend";
import { hasCashFlowData } from "@/lib/cash-flow";
import { captureCatalyst } from "@/lib/server/catalyst-capture";
import type {
  CashFlowQuality,
  CatalystSource,
  CatalystState,
  DividendSignals,
  ProposalLensBreakdown,
  RedTeamVerdict,
  ResearchSourceTag,
  ResearchStatus,
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
  /** The headlines that informed the catalyst (catalyst-news-sources M1) — kept
   *  so the catalyst is verifiable on the proposal + export + red-team. From
   *  Alpaca News (primary); empty when the catalyst came from Perplexity or none. */
  catalystSources: CatalystSource[];
  /** The catalyst capture state (catalyst-state-honesty M2): found / none /
   *  unavailable. A failed fetch is `unavailable`, never a silent "no catalyst". */
  catalystState: CatalystState;
  /** Cash-flow quality for the value lens (value-cashflow M1) — pulled from the
   *  SAME capped research fetch (no extra call). Attached to the value lens only;
   *  null when off/capped/unavailable. */
  cashFlow: CashFlowQuality | null;
  /** Dividend-sustainability signals for the value lens (dividend-floor M1) —
   *  same capped fetch. A durable, covered dividend registers a named floor. */
  dividend: DividendSignals | null;
  /** Whether the metered research was obtained (research-unavailable-state M3).
   *  Anything but `ok` → the value-quality fields are "data unavailable". */
  researchStatus: ResearchStatus;
  /** Specific failure reason when research wasn't ok (research-observability M1). */
  researchStatusReason: string | null;
  /** Which provider supplied `cashFlow` / `dividend` (proposal-source-footnotes
   *  M1) — from the research merge, for the source footnotes. Null when absent. */
  cashFlowSource: ResearchSourceTag | null;
  dividendSource: ResearchSourceTag | null;
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
  /** Analyze under a specific sleeve (core-long M3). Omitted/`swing-*` → the
   *  dual-lens (trend + value) path, unchanged. `core-long` → a single core-long
   *  proposal sized by target weight with no stop. */
  sleeve?: Sleeve;
  /** Target portfolio weight for a `core-long` analyze, a fraction (0.4 === 40%).
   *  Required for the core path; ignored for swing. */
  targetWeightPct?: number;
  /** The wide drawdown/review trigger for a `core-long` analyze, a fraction.
   *  Defaults to −25%. */
  reviewTriggerPct?: number;
  /** Extra sleeves to ALSO evaluate on the dual-lens (swing) analyze
   *  (verdict-matrix M7) — a subset of {`position-mid`, `core-long`}. Each appends
   *  its own lens to the proposal so the human reviews a sleeve × verdict matrix.
   *  Ignored when `sleeve` selects a dedicated single-sleeve path. */
  extraSleeves?: Sleeve[];
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
 *  fundamentals/sector + AI summary (capped) and maps a one-line catalyst.
 *  `force` re-spends a fresh fetch (the "Refresh research" rebuild,
 *  proposal-refresh-rebuilds M3); omitted it is cache-first. Exported so the
 *  refresh rebuild re-derives a proposal from the SAME research shape. */
export async function fetchResearchContext(
  symbol: string,
  opts?: { dataDir?: string; force?: boolean },
): Promise<ResearchContext> {
  const dataDir = opts?.dataDir;
  try {
    const r = await getSymbolResearch(symbol, { dataDir, force: opts?.force });
    // Multi-source catalyst capture (catalyst-news-sources M1): Alpaca News is the
    // PRIMARY catalyst source (free, Benzinga-powered, no daily cap, with
    // verifiable sources); Perplexity's curated `catalysts[]` phrases are the
    // fallback. A single source failing never yields "no catalyst" — the chain
    // falls through. (Company-description boilerplate is still rejected inside the
    // extractors, catalyst-extraction-quality M2.)
    const captured = await captureCatalyst({
      symbol,
      companyName: r.profile?.name,
      perplexityCatalysts: r.catalysts,
      perplexityStatus: r.perplexity,
    });
    // fundamentals-fallback-fmp M2: FMP-supplied value data counts as available.
    // If cashFlow or dividend is present from ANY provider (Perplexity or FMP),
    // the quality data is verified-available and researchStatus is "ok".
    const valueDataPresent = Boolean(r.cashFlow || r.dividend);
    return {
      sector: r.profile?.sector ?? null,
      catalyst: captured.catalyst,
      catalystType: captured.catalystType,
      catalystSources: captured.sources,
      catalystState: captured.state,
      cashFlow: r.cashFlow ?? null,
      dividend: r.dividend ?? null,
      researchStatus: valueDataPresent ? "ok" : r.perplexity,
      researchStatusReason: valueDataPresent ? null : r.perplexityReason,
      cashFlowSource: r.cashFlowSource ?? null,
      dividendSource: r.dividendSource ?? null,
      usedPerplexity: r.perplexity === "ok",
    };
  } catch {
    // Even if the deeper (Perplexity) research throws entirely, still try Alpaca
    // News for a catalyst — a single source failing must never silently render
    // "no catalyst" (the LLY failure this milestone fixes). Perplexity is
    // unavailable here, so the capture's state is `none` when news searched and
    // found nothing, or `unavailable` when news failed too.
    const captured = await captureCatalyst({
      symbol,
      perplexityStatus: "unavailable",
    }).catch(() => null);
    return {
      sector: null,
      catalyst: captured?.catalyst ?? null,
      catalystType: captured?.catalystType ?? null,
      catalystSources: captured?.sources ?? [],
      catalystState: captured?.state ?? "unavailable",
      cashFlow: null,
      dividend: null,
      researchStatus: "unavailable",
      researchStatusReason: null,
      cashFlowSource: null,
      dividendSource: null,
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
    // Per-sleeve rails (per-sleeve-rails M2): swing/mid require a stop (unchanged);
    // a no-stop sleeve (core-long) is governed by its review trigger instead.
    requiresStop: sleeveRequiresStop(sleeveOf(p)),
    reviewTriggerPct: p.reviewTriggerPct,
    targetWeightPct: p.targetWeightPct,
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
  dividend: DividendSignals | null = null,
  researchStatus: ResearchStatus | null = null,
  catalystSources: CatalystSource[] = [],
  catalystState: CatalystState | null = null,
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
    // The sector (red-team-fixes Issue 1) — so the prosecutor suppresses the
    // generic leverage/coverage/net-debt value-trap factors for financials.
    sector: d.sector ?? null,
    // The headlines behind the catalyst (catalyst-news-sources M1) — so the
    // prosecutor can see the catalyst is backed by real, datable news.
    catalystSources,
    // The capture state (catalyst-state-honesty M2) — so the prosecutor is told a
    // failed fetch is UNAVAILABLE, not absent, and won't reject for "no catalyst".
    catalystState,
    cashFlow: d.strategy === "value" ? cashFlow : null,
    dividend: d.strategy === "value" ? dividend : null,
    researchStatus: d.strategy === "value" ? researchStatus : null,
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
  dividend: DividendSignals | null = null,
  researchStatus: ResearchStatus | null = null,
  catalystSources: CatalystSource[] = [],
  catalystState: CatalystState | null = null,
  researchStatusReason: string | null = null,
  cashFlowSource: ResearchSourceTag | null = null,
  dividendSource: ResearchSourceTag | null = null,
  sleeve: Sleeve | null = null,
): ProposalLensBreakdown {
  return {
    strategy: d.strategy,
    // The lens's sleeve (verdict-matrix M7) — explicit for a multi-sleeve / mid
    // lens, null for the dual-lens swing path (derived from `strategy`).
    sleeve,
    limitPrice: d.limitPrice,
    stopPrice: d.stopPrice,
    takeProfit: d.takeProfit,
    targetType: d.targetType,
    qty: d.qty,
    riskPct: d.riskPct,
    // Risk-to-stop lenses (trend/value) carry no target weight / review trigger.
    targetWeightPct: null,
    reviewTriggerPct: null,
    relativeVolume: d.relativeVolume,
    catalyst: d.catalyst,
    catalystType: d.catalystType,
    // The headlines behind the catalyst (catalyst-news-sources M1) — shared across
    // both lenses (it is the symbol's news); surfaced on the detail page + export.
    catalystSources,
    // The capture state (catalyst-state-honesty M2) — per lens (the value lens's
    // dividend floor reads `found` even when the news catalyst was none/unavailable).
    catalystState,
    convictionScore: d.convictionScore,
    convictionTier: d.convictionTier,
    confidence: d.confidence,
    thesis: d.thesis,
    reasoning: d.reasoning,
    redTeam,
    cashFlow: d.strategy === "value" ? cashFlow : null,
    dividend: d.strategy === "value" ? dividend : null,
    // Research availability is a value-lens concern (its quality data); trend null.
    researchStatus: d.strategy === "value" ? researchStatus : null,
    researchStatusReason: d.strategy === "value" ? researchStatusReason : null,
    // Provenance of the value-quality blocks (proposal-source-footnotes M1) —
    // value lens only, mirroring the cashFlow/dividend attachment above.
    cashFlowSource: d.strategy === "value" ? cashFlowSource : null,
    dividendSource: d.strategy === "value" ? dividendSource : null,
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
    opts.fetchResearch ?? ((s: string) => fetchResearchContext(s, { dataDir }));
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

  const createdAt = now.toISOString();
  // Unique PER RUN, not just per day (so two same-day analyses don't collide on
  // id → one `/proposals/[id]` URL + a duplicate React key).
  const id = `manual-${symbol}-${createdAt.slice(0, 23).replace(/[-:.T]/g, "")}`;
  const advisory = false; // approvable; the gate (not this) is the money boundary

  // Per-sleeve derivation (core-long M3 / position-mid M4). `core-long` → a single
  // target-weight, no-stop proposal under the core lens; `position-mid` → a single
  // risk-to-stop proposal (wider stop band) under the mid lens. Otherwise the
  // dual-lens (trend + value) derivation, unchanged.
  const sharedArgs = {
    symbol,
    bars,
    quote,
    equity: snapshot.equity,
    research,
    account,
    advisory,
    id,
    createdAt,
    pricedAt: createdAt,
    researchAt: createdAt,
    redTeamExec: opts.redTeamExec,
    extraSleeves: opts.extraSleeves,
  };
  const derived =
    opts.sleeve === "core-long"
      ? await deriveCoreLongProposal({
          ...sharedArgs,
          targetWeightPct: opts.targetWeightPct,
          reviewTriggerPct: opts.reviewTriggerPct,
        })
      : opts.sleeve === "position-mid"
        ? await deriveMidProposal(sharedArgs)
        : await deriveProposalFromResearch(sharedArgs);
  if (!derived.ok) return derived;
  const { proposal, lenses, active, usedPerplexity } = derived;

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
  const risk = evaluateOrder(
    toOrder(proposal),
    ctx,
    railsForSleeve(sleeveOf(proposal)),
  );

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
      catalystSources: proposal.catalystSources,
      catalystState: proposal.catalystState,
      convictionScore: proposal.convictionScore,
      convictionTier: proposal.convictionTier,
      riskPct: proposal.riskPct,
      confidence: proposal.confidence,
      thesis: proposal.thesis,
      reasoning: proposal.reasoning,
      redTeam: proposal.redTeam,
      cashFlow: proposal.cashFlow,
      dividend: proposal.dividend,
      researchStatus: proposal.researchStatus,
      researchStatusReason: proposal.researchStatusReason,
      cashFlowSource: proposal.cashFlowSource,
      dividendSource: proposal.dividendSource,
      pricedAt: proposal.pricedAt,
      researchAt: proposal.researchAt,
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
    usedPerplexity,
  };
}

/** Inputs to the shared dual-lens proposal derivation. The caller controls the
 *  identity/meta (id / timestamps / account / status / origin); everything
 *  value-related is derived from `research` + `bars` + `quote`. */
export interface DeriveProposalArgs {
  symbol: string;
  bars: Ohlc[];
  quote: number | null;
  equity: number;
  research: ResearchContext;
  account: "paper" | "live";
  advisory: boolean;
  id: string;
  createdAt: string;
  /** When the levels were anchored (fresh-entry-levels M1). */
  pricedAt: string;
  /** When the value-lens research was derived (proposal-refresh-rebuilds M3). */
  researchAt: string;
  status?: TradeProposal["status"];
  origin?: TradeProposal["origin"];
  redTeamExec?: RedTeamExec;
  /** Extra sleeves to ALSO evaluate on this proposal (verdict-matrix M7) — a
   *  subset of {`position-mid`, `core-long`}. The dual swing lenses (trend +
   *  value) are always evaluated; each extra sleeve appends its own lens (own
   *  checklist + red-team), sharing the single research fetch. */
  extraSleeves?: Sleeve[];
}

export type DeriveProposalResult =
  | {
      ok: true;
      proposal: TradeProposal;
      lenses: ProposalLensBreakdown[];
      active: { draft: ManualProposalDraft; redTeam: RedTeamVerdict };
      usedPerplexity: boolean;
    }
  | { ok: false; code: "insufficient-data"; error: string };

/**
 * Build ONE dual-lens proposal from research + price history (shared by the
 * manual analyze pipeline and the "Refresh research" rebuild). Evaluates the
 * symbol under BOTH the trend and value mandates, runs each lens's cross-model
 * red-team, and mirrors the higher-conviction lens to the top-level fields. The
 * value lens carries the cash-flow / dividend / research-status quality signals;
 * the trend lens carries null. Pure of persistence — the caller writes/overwrites.
 */
export async function deriveProposalFromResearch(
  args: DeriveProposalArgs,
): Promise<DeriveProposalResult> {
  const { symbol, bars, quote, equity, research, account, advisory } = args;

  // Research is shared across both lenses (one capped fetch); each lens gets its
  // own deterministic draft + its own red-team verdict.
  const researchInput = {
    symbol,
    bars,
    // Anchor BOTH lenses to the SAME current quote (fresh-entry-levels M1).
    quote,
    equity,
    sector: research.sector,
    catalyst: research.catalyst,
    catalystType: research.catalystType,
    // The capture state (catalyst-state-honesty M2) drives the thesis wording so a
    // failed fetch reads "data unavailable", never a flat "no catalyst".
    catalystState: research.catalystState,
  };

  // Dividend floor (dividend-floor M1): a durable, well-covered dividend is a
  // recognized VALUE floor. When covered AND the value lens has no other named
  // catalyst, register the concrete floor as its "Catalyst or floor — why now"
  // (instead of "Unspecified") and lift its conviction; an at-risk dividend
  // drags. Value lens only — the floor never touches the trend draft.
  const dividendFloor = assessDividendFloor(research.dividend);
  const registerFloor = dividendFloor.covered && research.catalyst == null;
  // The value lens's catalyst state: a registered dividend floor IS a found
  // catalyst (the floor), even when the news catalyst was none/unavailable.
  const valueCatalystState: CatalystState = registerFloor
    ? "found"
    : research.catalystState;
  const valueInput = {
    ...researchInput,
    strategy: "value" as const,
    catalystState: valueCatalystState,
    ...(registerFloor
      ? { catalyst: dividendFloor.floorText, catalystType: "other" as const }
      : {}),
    dividendFloor: { covered: dividendFloor.covered, atRisk: dividendFloor.atRisk },
    // Conviction-honesty M1: unknown cash-flow drags + caps value conviction
    // below "high" — a value play we can't quality-check isn't high-conviction.
    qualityDataKnown: hasCashFlowData(research.cashFlow),
  };

  const trendDraft = buildManualProposalDraft({ ...researchInput, strategy: "trend" });
  const valueDraft = buildManualProposalDraft(valueInput);
  if (!trendDraft || !valueDraft) {
    return {
      ok: false,
      code: "insufficient-data",
      error: `Not enough Alpaca price history to analyze ${symbol} (need ~30 daily bars). Prices are Alpaca-only.`,
    };
  }

  // Cash-flow quality (value-cashflow M1) + dividend signals (dividend-floor M1)
  // — VALUE-lens signals from the shared research. Attached to the value lens +
  // briefed to the value red-team only.
  const cashFlow = research.cashFlow;
  const dividend = research.dividend;
  // Research availability (research-unavailable-state M3 / fundamentals-fallback-fmp M2):
  // when off/capped/failed the value-quality fields are "data unavailable" (explicit,
  // not a silent —). However, if cashFlow or dividend is present from ANY provider
  // (Perplexity OR FMP), the quality data is verified-available → "ok".
  const valueDataPresent = Boolean(cashFlow || dividend);
  const researchStatus = valueDataPresent ? "ok" : research.researchStatus;
  const researchStatusReason = valueDataPresent ? null : research.researchStatusReason;
  const catalystSources = research.catalystSources;
  const catalystState = research.catalystState;

  // Run each lens's red-team under its matching mandate.
  const [trendRedTeam, valueRedTeam] = await Promise.all([
    runRedTeam(
      redTeamInput(trendDraft, null, null, null, catalystSources, catalystState),
      { exec: args.redTeamExec },
    ),
    runRedTeam(
      redTeamInput(
        valueDraft,
        cashFlow,
        dividend,
        researchStatus,
        catalystSources,
        valueCatalystState,
      ),
      { exec: args.redTeamExec },
    ),
  ]);

  const lenses: ProposalLensBreakdown[] = [
    draftToLens(
      trendDraft,
      trendRedTeam,
      null,
      null,
      null,
      catalystSources,
      catalystState,
      null,
    ),
    draftToLens(
      valueDraft,
      valueRedTeam,
      cashFlow,
      dividend,
      researchStatus,
      catalystSources,
      valueCatalystState,
      researchStatusReason,
      research.cashFlowSource,
      research.dividendSource,
    ),
  ];

  // Extra sleeve-lenses (verdict-matrix M7) — evaluate the symbol under each
  // additionally-selected sleeve, sharing this one research fetch. Each appends a
  // lens with its OWN checklist + red-team; the matrix shows every evaluated sleeve.
  const extras = args.extraSleeves ?? [];

  if (extras.includes("position-mid")) {
    const midDraft = buildManualProposalDraft({
      symbol,
      bars,
      quote,
      equity,
      strategy: "trend",
      sector: research.sector,
      catalyst: research.catalyst,
      catalystType: research.catalystType,
      catalystState: research.catalystState,
      stopBandPct: MID_STOP_BAND_PCT,
      riskLimits: { perPositionSizePct: railsForSleeve("position-mid").perPositionSizePct },
    });
    if (midDraft) {
      const midRedTeam = await runRedTeam(
        {
          ...redTeamInput(midDraft, cashFlow, null, researchStatus, catalystSources, catalystState),
          sleeve: "position-mid",
          cashFlow,
          researchStatus,
        },
        { exec: args.redTeamExec },
      );
      lenses.push(
        draftToLens(midDraft, midRedTeam, null, null, null, catalystSources, catalystState, null, null, null, "position-mid"),
      );
    }
  }

  if (extras.includes("core-long")) {
    const coreDraft = buildCoreLongProposalDraft({
      symbol,
      bars,
      quote,
      equity,
      targetWeightPct: DEFAULT_CORE_TARGET_WEIGHT,
      perPositionSizePct: railsForSleeve("core-long").perPositionSizePct,
      sector: research.sector,
      qualityDataKnown: hasCashFlowData(cashFlow),
    });
    if (coreDraft) {
      const coreRedTeam = await runRedTeam(
        {
          symbol: coreDraft.symbol,
          action: coreDraft.action,
          side: coreDraft.side,
          sleeve: "core-long",
          qty: coreDraft.qty,
          limitPrice: coreDraft.limitPrice,
          stopPrice: null,
          takeProfit: null,
          targetType: null,
          targetWeightPct: coreDraft.targetWeightPct,
          reviewTriggerPct: coreDraft.reviewTriggerPct,
          sector: coreDraft.sector,
          cashFlow,
          researchStatus,
          thesis: coreDraft.thesis,
          reasoning: coreDraft.reasoning,
        },
        { exec: args.redTeamExec },
      );
      lenses.push({
        strategy: coreDraft.strategy,
        sleeve: "core-long",
        limitPrice: coreDraft.limitPrice,
        stopPrice: null,
        takeProfit: null,
        targetType: null,
        qty: coreDraft.qty,
        riskPct: coreDraft.riskPct,
        targetWeightPct: coreDraft.targetWeightPct,
        reviewTriggerPct: coreDraft.reviewTriggerPct,
        relativeVolume: null,
        catalyst: null,
        catalystType: null,
        catalystSources: [],
        catalystState: null,
        convictionScore: coreDraft.convictionScore,
        convictionTier: coreDraft.convictionTier,
        confidence: coreDraft.confidence,
        thesis: coreDraft.thesis,
        reasoning: coreDraft.reasoning,
        redTeam: coreRedTeam,
        cashFlow,
        dividend: null,
        researchStatus,
        researchStatusReason: null,
        cashFlowSource: research.cashFlowSource,
        dividendSource: null,
      });
    }
  }

  // The proposal's top-level fields mirror the ACTIVE (default) lens — the
  // higher-conviction one (tie → trend).
  const active =
    valueDraft.convictionScore > trendDraft.convictionScore
      ? { draft: valueDraft, redTeam: valueRedTeam }
      : { draft: trendDraft, redTeam: trendRedTeam };
  const activeCashFlow = active.draft.strategy === "value" ? cashFlow : null;
  const activeDividend = active.draft.strategy === "value" ? dividend : null;
  const activeResearchStatus =
    active.draft.strategy === "value" ? researchStatus : null;
  const activeResearchStatusReason =
    active.draft.strategy === "value" ? researchStatusReason : null;
  const activeCashFlowSource =
    active.draft.strategy === "value" ? research.cashFlowSource : null;
  const activeDividendSource =
    active.draft.strategy === "value" ? research.dividendSource : null;
  const activeCatalystState =
    active.draft.strategy === "value" ? valueCatalystState : catalystState;

  const proposal: TradeProposal = TradeProposalSchema.parse({
    ...active.draft,
    id: args.id,
    createdAt: args.createdAt,
    pricedAt: args.pricedAt,
    researchAt: args.researchAt,
    account,
    advisory,
    origin: args.origin ?? "manual-request",
    status: args.status ?? "pending",
    redTeam: active.redTeam,
    catalystSources,
    catalystState: activeCatalystState,
    cashFlow: activeCashFlow,
    dividend: activeDividend,
    researchStatus: activeResearchStatus,
    researchStatusReason: activeResearchStatusReason,
    cashFlowSource: activeCashFlowSource,
    dividendSource: activeDividendSource,
    lenses,
  });

  return {
    ok: true,
    proposal,
    lenses,
    active,
    usedPerplexity: research.usedPerplexity,
  };
}

/** Default target weight when a core-long analyze omits one — a conservative
 *  single-position starter weight, well inside the sleeve size cap. */
const DEFAULT_CORE_TARGET_WEIGHT = 0.1;

/**
 * Derive a **core-long** proposal from shared research (core-long M3) — a single
 * target-weight, no-stop position judged by the core-long red-team lens. Parallel
 * to {@link deriveProposalFromResearch}; it never touches the dual-lens path. The
 * proposal carries `sleeve: "core-long"`, a single lens, the target weight + a
 * drawdown/review trigger in place of a stop, and (for a single name) the quality
 * data so the core checklist's quality item is honest.
 */
export async function deriveCoreLongProposal(
  args: DeriveProposalArgs & {
    targetWeightPct?: number;
    reviewTriggerPct?: number;
  },
): Promise<DeriveProposalResult> {
  const { symbol, bars, quote, equity, research, account, advisory } = args;
  const coreLimits = railsForSleeve("core-long");
  const cashFlow = research.cashFlow;
  const qualityDataKnown = hasCashFlowData(cashFlow);

  const draft = buildCoreLongProposalDraft({
    symbol,
    bars,
    quote,
    equity,
    targetWeightPct: args.targetWeightPct ?? DEFAULT_CORE_TARGET_WEIGHT,
    reviewTriggerPct: args.reviewTriggerPct,
    perPositionSizePct: coreLimits.perPositionSizePct,
    sector: research.sector,
    qualityDataKnown,
  });
  if (!draft) {
    return {
      ok: false,
      code: "insufficient-data",
      error: `Not enough Alpaca price history to analyze ${symbol} as a core holding (need ~30 daily bars). Prices are Alpaca-only.`,
    };
  }

  // Quality data is verified-available when present from any provider.
  const researchStatus = cashFlow ? "ok" : research.researchStatus;
  const researchStatusReason = cashFlow ? null : research.researchStatusReason;

  const redTeam = await runRedTeam(
    {
      symbol: draft.symbol,
      action: draft.action,
      side: draft.side,
      sleeve: "core-long",
      qty: draft.qty,
      limitPrice: draft.limitPrice,
      stopPrice: null,
      takeProfit: null,
      targetType: null,
      targetWeightPct: draft.targetWeightPct,
      reviewTriggerPct: draft.reviewTriggerPct,
      sector: draft.sector,
      // Cash-flow is the single-name quality tell; a fund simply has none.
      cashFlow,
      researchStatus,
      thesis: draft.thesis,
      reasoning: draft.reasoning,
    },
    { exec: args.redTeamExec },
  );

  const lens: ProposalLensBreakdown = {
    strategy: draft.strategy,
    sleeve: "core-long",
    limitPrice: draft.limitPrice,
    stopPrice: null,
    takeProfit: null,
    targetType: null,
    qty: draft.qty,
    riskPct: draft.riskPct,
    targetWeightPct: draft.targetWeightPct,
    reviewTriggerPct: draft.reviewTriggerPct,
    relativeVolume: null,
    catalyst: null,
    catalystType: null,
    catalystSources: [],
    catalystState: null,
    convictionScore: draft.convictionScore,
    convictionTier: draft.convictionTier,
    confidence: draft.confidence,
    thesis: draft.thesis,
    reasoning: draft.reasoning,
    redTeam,
    cashFlow,
    dividend: null,
    researchStatus,
    researchStatusReason,
    cashFlowSource: research.cashFlowSource,
    dividendSource: null,
  };

  const proposal: TradeProposal = TradeProposalSchema.parse({
    symbol: draft.symbol,
    action: draft.action,
    side: draft.side,
    sleeve: "core-long",
    strategy: draft.strategy,
    qty: draft.qty,
    limitPrice: draft.limitPrice,
    stopPrice: null,
    takeProfit: null,
    targetType: null,
    targetWeightPct: draft.targetWeightPct,
    reviewTriggerPct: draft.reviewTriggerPct,
    sector: draft.sector,
    relativeVolume: null,
    catalyst: null,
    catalystType: null,
    convictionScore: draft.convictionScore,
    convictionTier: draft.convictionTier,
    riskPct: draft.riskPct,
    confidence: draft.confidence,
    thesis: draft.thesis,
    reasoning: draft.reasoning,
    id: args.id,
    createdAt: args.createdAt,
    pricedAt: args.pricedAt,
    researchAt: args.researchAt,
    account,
    advisory,
    origin: args.origin ?? "manual-request",
    status: args.status ?? "pending",
    redTeam,
    cashFlow,
    researchStatus,
    researchStatusReason,
    cashFlowSource: research.cashFlowSource,
    lenses: [lens],
  });

  return {
    ok: true,
    proposal,
    lenses: [lens],
    active: { draft: draft as unknown as ManualProposalDraft, redTeam },
    usedPerplexity: research.usedPerplexity,
  };
}

/** The mid sleeve's wider fixed-stop band (vs the swing 8%) — a longer hold wants
 *  more room (position-mid M4). The tighter of this and 2×ATR still wins. */
const MID_STOP_BAND_PCT = 0.12;

/**
 * Derive a **position-mid** proposal from shared research (position-mid M4) — a
 * single risk-to-stop position under the mid lens, with a **wider stop band** and
 * the position-mid size rail. It reuses the swing builder (mid is risk-to-stop,
 * `requiresStop: true`); the sleeve drives the checklist + red-team lens. Parallel
 * to {@link deriveProposalFromResearch}; it never touches the dual-lens path.
 */
export async function deriveMidProposal(
  args: DeriveProposalArgs,
): Promise<DeriveProposalResult> {
  const { symbol, bars, quote, equity, research, account, advisory } = args;
  const midLimits = railsForSleeve("position-mid");

  const draft = buildManualProposalDraft({
    symbol,
    bars,
    quote,
    equity,
    // The blend leads on trend; the sleeve (not the strategy) drives the mid lens.
    strategy: "trend",
    sector: research.sector,
    catalyst: research.catalyst,
    catalystType: research.catalystType,
    catalystState: research.catalystState,
    stopBandPct: MID_STOP_BAND_PCT,
    riskLimits: { perPositionSizePct: midLimits.perPositionSizePct },
  });
  if (!draft) {
    return {
      ok: false,
      code: "insufficient-data",
      error: `Not enough Alpaca price history to analyze ${symbol} as a mid-term position (need ~30 daily bars). Prices are Alpaca-only.`,
    };
  }

  const cashFlow = research.cashFlow;
  const researchStatus = cashFlow ? "ok" : research.researchStatus;
  const catalystSources = research.catalystSources;
  const catalystState = research.catalystState;

  const redTeam = await runRedTeam(
    {
      ...redTeamInput(
        draft,
        cashFlow,
        null,
        researchStatus,
        catalystSources,
        catalystState,
      ),
      sleeve: "position-mid",
      // The mid lens weighs the fundamental story, so brief its cash-flow quality
      // even though the draft's display strategy is `trend`.
      cashFlow,
      researchStatus,
    },
    { exec: args.redTeamExec },
  );

  const lens = draftToLens(
    draft,
    redTeam,
    null,
    null,
    null,
    catalystSources,
    catalystState,
    null,
    null,
    null,
    "position-mid",
  );

  const proposal: TradeProposal = TradeProposalSchema.parse({
    ...draft,
    sleeve: "position-mid",
    id: args.id,
    createdAt: args.createdAt,
    pricedAt: args.pricedAt,
    researchAt: args.researchAt,
    account,
    advisory,
    origin: args.origin ?? "manual-request",
    status: args.status ?? "pending",
    redTeam,
    catalystSources,
    catalystState,
    lenses: [lens],
  });

  return {
    ok: true,
    proposal,
    lenses: [lens],
    active: { draft, redTeam },
    usedPerplexity: research.usedPerplexity,
  };
}
