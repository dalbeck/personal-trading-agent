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

export type ResearchProviderName = "off" | "perplexity";

export function getResearchProvider(
  opts?: { provider?: ResearchProviderName } & PerplexityOpts,
): ResearchProvider {
  const which =
    opts?.provider ??
    (process.env.RESEARCH_PROVIDER as ResearchProviderName | undefined) ??
    "off";
  if (which === "perplexity") return createPerplexityProvider(opts);
  return offProvider;
}

export type {
  ResearchProvider,
  ResearchQuery,
  ResearchResult,
  ResearchSource,
} from "./types";
