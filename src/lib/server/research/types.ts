/**
 * Swappable research-provider interface (Phase 2 M8). The research step can use
 * Perplexity, a plain web search, or nothing. Research is for CONTEXT ONLY —
 * never order pricing or execution (Alpaca is the source of truth for prices).
 */

import type { CashFlowQuality, DividendSignals } from "@/lib/types";

export interface ResearchQuery {
  symbol: string;
  question?: string;
}

export interface ResearchSource {
  title: string;
  url: string;
}

/**
 * One structured `finance_results` block from the Perplexity Agent API's
 * `finance_search` tool — markdown tables (quotes / income / balance /
 * cash-flow / analyst estimates / earnings) with their own sources.
 */
export interface ResearchFinanceResult {
  categories: string[];
  tickers: string[];
  content: string;
  sources: ResearchSource[];
}

/**
 * Company profile fields for the right-rail, extracted from the model's
 * structured JSON block (see `parse.ts`). Every field is nullable — the UI
 * shows "—" rather than fabricating one. Research/context only.
 */
export interface ResearchProfile {
  /** Company display name, e.g. "Apple, Inc." (Perplexity, or derived from the
   *  Robinhood description). Null falls back to the ticker in the UI. */
  name: string | null;
  /** Primary website domain, e.g. "apple.com" (Perplexity) — drives the brand
   *  logo lookup. Null falls back to a monogram tile. */
  domain: string | null;
  ceo: string | null;
  employees: number | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
  ipoDate: string | null;
  description: string | null;
}

/** Fundamentals for the stats grid. `dividendYield` is a fraction (0.0072 === 0.72%). */
export interface ResearchFundamentals {
  marketCap: number | null;
  peRatio: number | null;
  eps: number | null;
  dividendYield: number | null;
}

/** Sell-side analyst consensus block. */
export interface ResearchConsensus {
  rating: string | null;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  analystCount: number | null;
}

/**
 * One reported quarter for the earnings beat/miss strip — the actual-vs-estimate
 * data made glanceable. `surprisePct` and `priceMovePct` are **fractions**
 * (0.043 === +4.3%). Every field is nullable; `beat` is computed from
 * actual-vs-estimate when both are present, else null.
 */
export interface EarningsQuarter {
  /** Period label, e.g. "Q1 FY26" or "2026-03-31". */
  period: string;
  epsActual: number | null;
  epsEstimate: number | null;
  /** EPS surprise as a fraction of |estimate| (0.043 === +4.3%). */
  surprisePct: number | null;
  /** Post-earnings price move as a fraction (−0.021 === −2.1%). */
  priceMovePct: number | null;
  /** actual >= estimate; null when either side is missing. */
  beat: boolean | null;
}

/**
 * A typed, scaffolding-stripped slice of the `finance_search` finance_results —
 * what the "View full financials & transcript" expander renders. `content` is
 * clean markdown (no field guides, column legends, CSV references) ready for the
 * safe Markdown renderer.
 */
export type FinanceSectionKind =
  | "quote"
  | "profile"
  | "financials"
  | "earnings"
  | "transcript"
  | "other";

export interface FinanceSection {
  kind: FinanceSectionKind;
  title: string;
  content: string;
  sources: ResearchSource[];
}

export interface ResearchResult {
  provider: string;
  symbol: string;
  summary: string;
  sources: ResearchSource[];
  usedAt: string;
  /** Structured finance_search payload; empty when none was returned. */
  finance: ResearchFinanceResult[];
  /** Category tags aggregated across the finance_results blocks. */
  categories: string[];
  /** Tickers referenced by the finance_results blocks. */
  tickers: string[];
  /** Coerced company profile for the right rail; null when none was returned. */
  profile?: ResearchProfile | null;
  /** Coerced fundamentals for the stats grid; null when none was returned. */
  fundamentals?: ResearchFundamentals | null;
  /** Coerced analyst consensus; null when none was returned. */
  consensus?: ResearchConsensus | null;
  /** Recent reported quarters for the earnings strip; [] when none. */
  earnings?: EarningsQuarter[];
  /** Short catalyst phrases for the catalyst chips; [] when none. */
  catalysts?: string[];
  /** Cash-flow quality for the value lens (FCF level/trend/yield, leverage); null
   *  when none was returned. Folded into this one capped fetch — no extra call. */
  cashFlow?: CashFlowQuality | null;
  /** Dividend-sustainability signals for the value lens (yield, payout, coverage,
   *  growth streak); null when none. Folded into the same capped fetch. */
  dividend?: DividendSignals | null;
  /** Real per-call cost in USD, when the Agent API reports it. */
  cost?: number;
}

export interface ResearchProvider {
  readonly name: string;
  /** Returns context, or `null` when off / capped / unavailable. Never throws. */
  research(query: ResearchQuery): Promise<ResearchResult | null>;
  /** The diagnostic for the most recent `research()` call on this instance, or
   *  null if it has not been called. Lets the orchestrator surface a specific
   *  failure reason without changing `research()`'s return contract. */
  lastDiagnostic?(): import("./diagnostics").ResearchDiagnostic | null;
}

/** Which source actually supplied a field group, for honest per-section tagging. */
export type ResearchOrigin = "robinhood" | "perplexity" | null;

export type PerplexityStatus = "ok" | "off" | "capped" | "unavailable";

/**
 * The merged symbol-research payload the Perplexity-style layout consumes. The
 * orchestrator (`lib/server/symbol-research.ts`) prefers **Robinhood**
 * `get_equity_fundamentals` (read-only, no metered cost) for fundamentals +
 * profile and falls back to **Perplexity** field-by-field; analyst consensus and
 * the AI narrative come from Perplexity only. Cached per-symbol-per-day so a
 * refresh or navigate-away-and-back never re-spends. Every field is nullable —
 * the UI renders "—" rather than fabricating one.
 */
export interface SymbolResearch {
  fundamentals: ResearchFundamentals | null;
  fundamentalsSource: ResearchOrigin;
  profile: ResearchProfile | null;
  profileSource: ResearchOrigin;
  /** Analyst consensus — Perplexity only (Robinhood does not provide it). */
  consensus: ResearchConsensus | null;
  /** AI narrative summary — Perplexity only. The card's distilled thesis. */
  summary: string;
  /** Recent reported quarters for the earnings beat/miss strip; [] when none. */
  earnings: EarningsQuarter[];
  /** Short catalyst phrases for the catalyst chips; [] when none. */
  catalysts: string[];
  /** Cash-flow quality for the value lens (value-cashflow M1) — FCF level/trend,
   *  FCF yield, leverage/coverage. Perplexity-supplied (Robinhood does not carry
   *  it); null when unavailable. Drives the value checklist + red-team + stat
   *  block. Folded into the one capped value research fetch — no extra call. */
  cashFlow: CashFlowQuality | null;
  /** Dividend-sustainability signals for the value lens (dividend-floor M1) —
   *  yield, payout ratio, FCF coverage, growth streak. Perplexity-supplied; null
   *  when unavailable. Drives the dividend floor (catalyst) + red-team + stat
   *  block + conviction. Folded into the same capped value fetch — no extra call. */
  dividend: DividendSignals | null;
  /** Raw finance_results blocks (kept for back-compat / debugging). */
  finance: ResearchFinanceResult[];
  /**
   * Typed, scaffolding-stripped finance sections for the expander. Derived from
   * `finance` server-side so the UI never receives field guides / legends / CSV
   * references.
   */
  sections: FinanceSection[];
  categories: string[];
  sources: ResearchSource[];
  /** Perplexity retrieval timestamp (RFC3339), when it was called. */
  usedAt: string | null;
  /** Real Perplexity per-call cost (USD), when reported. */
  cost: number | null;
  robinhoodConnected: boolean;
  perplexity: PerplexityStatus;
  /** A specific, human failure reason when `perplexity` is not "ok" — e.g.
   *  "HTTP 402 (check API billing)" / "timed out (35s)" / "no API key
   *  configured" (research-observability M1). Null when ok / off / unknown. */
  perplexityReason: string | null;
  /** True when this payload was served from the cache (no fresh call). */
  cached: boolean;
  /** When this payload was fetched (ISO). Drives the "fetched N ago" freshness
   *  label + the soft max-age refetch. Null on a never-cached live build. */
  fetchedAt: string | null;
}
