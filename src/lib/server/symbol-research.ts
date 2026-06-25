import "server-only";

import {
  getRobinhoodFundamentals,
  hasRobinhoodConnection,
} from "./robinhood";
import { getResearchProvider } from "./research";
import { readResearchCache, writeResearchCache } from "./research/cache";
import { getResearchCallCount } from "./research/usage";
import type {
  PerplexityStatus,
  ResearchFundamentals,
  ResearchProfile,
  ResearchProvider,
  ResearchResult,
  SymbolResearch,
} from "./research/types";

/**
 * Orchestrates the symbol page's research from the cheapest source first:
 *
 *   1. **Robinhood** `get_equity_fundamentals` (read-only, no metered cost) is
 *      preferred for fundamentals + company profile.
 *   2. **Perplexity** `finance_search` (metered, capped) fills the gaps
 *      field-by-field and is the ONLY source of analyst consensus + the AI
 *      narrative — so it auto-loads as a fallback, not for data Robinhood already
 *      has.
 *
 * The merged payload is **cached per-symbol-per-day**, so a refresh or
 * navigate-away-and-back never re-spends. Always resolves (never throws) — every
 * field is nullable and the UI renders "—".
 */

interface GetSymbolResearchOpts {
  now?: () => Date;
  dataDir?: string;
  /** Injectable Robinhood fundamentals fetch (tests bypass the CLI). */
  fetchRobinhood?: (
    symbol: string,
  ) => Promise<{ fundamentals: ResearchFundamentals; profile: ResearchProfile } | null>;
  /** Injectable research provider (tests bypass the network). */
  provider?: ResearchProvider;
  robinhoodConnected?: boolean;
  dailyCap?: number;
}

/** Pure merge: Robinhood preferred for fundamentals/profile (field-by-field),
 *  Perplexity fills gaps and supplies consensus + the AI summary. */
export function mergeSymbolResearch(args: {
  rh: { fundamentals: ResearchFundamentals; profile: ResearchProfile } | null;
  perplexity: ResearchResult | null;
  robinhoodConnected: boolean;
  perplexityStatus: PerplexityStatus;
}): SymbolResearch {
  const { rh, perplexity, robinhoodConnected, perplexityStatus } = args;
  const rf = rh?.fundamentals ?? null;
  const pf = perplexity?.fundamentals ?? null;
  const fundamentals: ResearchFundamentals | null =
    rf || pf
      ? {
          marketCap: rf?.marketCap ?? pf?.marketCap ?? null,
          peRatio: rf?.peRatio ?? pf?.peRatio ?? null,
          eps: rf?.eps ?? pf?.eps ?? null,
          dividendYield: rf?.dividendYield ?? pf?.dividendYield ?? null,
        }
      : null;

  const rp = rh?.profile ?? null;
  const pp = perplexity?.profile ?? null;
  const profile: ResearchProfile | null =
    rp || pp
      ? {
          ceo: rp?.ceo ?? pp?.ceo ?? null,
          employees: rp?.employees ?? pp?.employees ?? null,
          sector: rp?.sector ?? pp?.sector ?? null,
          industry: rp?.industry ?? pp?.industry ?? null,
          country: rp?.country ?? pp?.country ?? null,
          exchange: rp?.exchange ?? pp?.exchange ?? null,
          ipoDate: rp?.ipoDate ?? pp?.ipoDate ?? null,
          description: rp?.description ?? pp?.description ?? null,
        }
      : null;

  return {
    fundamentals,
    fundamentalsSource: rf ? "robinhood" : pf ? "perplexity" : null,
    profile,
    profileSource: rp ? "robinhood" : pp ? "perplexity" : null,
    consensus: perplexity?.consensus ?? null,
    summary: perplexity?.summary ?? "",
    finance: perplexity?.finance ?? [],
    categories: perplexity?.categories ?? [],
    sources: perplexity?.sources ?? [],
    usedAt: perplexity?.usedAt ?? null,
    cost: perplexity?.cost ?? null,
    robinhoodConnected,
    perplexity: perplexityStatus,
    cached: false,
  };
}

export async function getSymbolResearch(
  symbol: string,
  opts?: GetSymbolResearchOpts,
): Promise<SymbolResearch> {
  const now = opts?.now?.() ?? new Date();
  const date = now.toISOString().slice(0, 10);
  const dataDir = opts?.dataDir;

  const cached = await readResearchCache(symbol, date, { dataDir });
  if (cached) return cached;

  const robinhoodConnected = opts?.robinhoodConnected ?? hasRobinhoodConnection();
  const provider = opts?.provider ?? getResearchProvider();
  const providerOn = provider.name !== "off";
  const fetchRh = opts?.fetchRobinhood ?? getRobinhoodFundamentals;

  const [rh, pplx] = await Promise.all([
    robinhoodConnected
      ? Promise.resolve(fetchRh(symbol)).catch(() => null)
      : Promise.resolve(null),
    providerOn
      ? Promise.resolve(provider.research({ symbol })).catch(() => null)
      : Promise.resolve(null),
  ]);

  let perplexityStatus: PerplexityStatus;
  if (!providerOn) {
    perplexityStatus = "off";
  } else if (pplx) {
    perplexityStatus = "ok";
  } else {
    const cap =
      opts?.dailyCap ?? Number(process.env.PERPLEXITY_DAILY_CALL_CAP ?? "30");
    const used = await getResearchCallCount(date, { dataDir });
    perplexityStatus = used >= cap ? "capped" : "unavailable";
  }

  const merged = mergeSymbolResearch({
    rh,
    perplexity: pplx,
    robinhoodConnected,
    perplexityStatus,
  });

  // Only cache a payload that carries real data — never pin a transient failure
  // (or a plain "off/capped with nothing") for the rest of the day.
  if (
    merged.fundamentals ||
    merged.profile ||
    merged.consensus ||
    merged.summary
  ) {
    await writeResearchCache(symbol, date, merged, { dataDir });
  }

  return merged;
}
