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
  /** Real per-call cost in USD, when the Agent API reports it. */
  cost?: number;
}

export interface ResearchProvider {
  readonly name: string;
  /** Returns context, or `null` when off / capped / unavailable. Never throws. */
  research(query: ResearchQuery): Promise<ResearchResult | null>;
}
