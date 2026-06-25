/**
 * Swappable research-provider interface (Phase 2 M8). The research step can use
 * Perplexity, a plain web search, or nothing. Research is for CONTEXT ONLY —
 * never order pricing or execution (Alpaca is the source of truth for prices).
 */

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
  /** Real per-call cost in USD, when the Agent API reports it. */
  cost?: number;
}

export interface ResearchProvider {
  readonly name: string;
  /** Returns context, or `null` when off / capped / unavailable. Never throws. */
  research(query: ResearchQuery): Promise<ResearchResult | null>;
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
  /** AI narrative summary — Perplexity only. */
  summary: string;
  finance: ResearchFinanceResult[];
  categories: string[];
  sources: ResearchSource[];
  /** Perplexity retrieval timestamp (RFC3339), when it was called. */
  usedAt: string | null;
  /** Real Perplexity per-call cost (USD), when reported. */
  cost: number | null;
  robinhoodConnected: boolean;
  perplexity: PerplexityStatus;
  /** True when this payload was served from the per-day cache (no fresh call). */
  cached: boolean;
}
