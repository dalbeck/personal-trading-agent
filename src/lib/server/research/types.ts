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

export interface ResearchResult {
  provider: string;
  symbol: string;
  summary: string;
  sources: ResearchSource[];
  usedAt: string;
}

export interface ResearchProvider {
  readonly name: string;
  /** Returns context, or `null` when off / capped / unavailable. Never throws. */
  research(query: ResearchQuery): Promise<ResearchResult | null>;
}
