import { createFmpProvider, type FmpOpts } from "./fmp";
import { offProvider } from "./off";
import { createPerplexityProvider, type PerplexityOpts } from "./perplexity";
import type { ResearchProvider } from "./types";

/**
 * Research-provider factory. Default **off** (`RESEARCH_PROVIDER=off`) — with it
 * off, zero API calls occur and the desk behaves exactly as without M8. Only the
 * pre-market research routine should call the returned provider, and only for
 * the shortlist / earnings-soon tickers (never every ticker on every routine).
 */

/** Journal tag marking an entry whose research used the metered provider, so we
 *  can later assess whether it actually improved decisions. */
export const RESEARCH_TAG = "research:perplexity";

export type ResearchProviderName = "off" | "perplexity" | "fmp";

export function getResearchProvider(
  opts?: { provider?: ResearchProviderName } & PerplexityOpts & FmpOpts,
): ResearchProvider {
  const which =
    opts?.provider ??
    (process.env.RESEARCH_PROVIDER as ResearchProviderName | undefined) ??
    "off";
  if (which === "perplexity") return createPerplexityProvider(opts);
  if (which === "fmp") return createFmpProvider(opts as FmpOpts);
  return offProvider;
}

/**
 * Fallback fundamentals provider consulted only when Perplexity didn't supply
 * value-quality data (Perplexity → FMP → unavailable chain). Default-off: when
 * no FMP key is configured, returns the off provider so no requests are made.
 *
 * Cash-flow / fundamentals / dividend research ONLY — never order pricing.
 */
export function getFundamentalsFallbackProvider(
  opts?: FmpOpts,
): ResearchProvider {
  const key = opts?.apiKey ?? process.env.FMP_API_KEY ?? "";
  if (key) return createFmpProvider(opts);
  return offProvider;
}

export { createFmpProvider, type FmpOpts } from "./fmp";
export { createPerplexityProvider, type PerplexityOpts } from "./perplexity";

export type {
  ResearchFinanceResult,
  ResearchProvider,
  ResearchQuery,
  ResearchResult,
  ResearchSource,
} from "./types";
