import "server-only";

import {
  getRobinhoodFundamentals,
  hasRobinhoodConnection,
} from "./robinhood";
import { getFundamentalsFallbackProvider, getResearchProvider } from "./research";
import { readResearchCache, writeResearchCache } from "./research/cache";
import { buildFinanceSections } from "./research/sections";
import { diagnosticToStatus, researchReasonText } from "./research/diagnostics";
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

/** Soft max-age: cached research older than this auto-refetches (the daily cap
 *  still gates the spend). A manual refresh (`force`) always refetches. */
const RESEARCH_MAX_AGE_MS =
  Number(process.env.RESEARCH_MAX_AGE_DAYS ?? 7) * 86_400_000;

interface GetSymbolResearchOpts {
  now?: () => Date;
  dataDir?: string;
  /** Force a refetch (manual Refresh), bypassing the fresh-cache short-circuit. */
  force?: boolean;
  /** Override the soft max-age (tests). */
  maxAgeMs?: number;
  /** Injectable Robinhood fundamentals fetch (tests bypass the CLI). */
  fetchRobinhood?: (
    symbol: string,
  ) => Promise<{ fundamentals: ResearchFundamentals; profile: ResearchProfile } | null>;
  /** Injectable research provider (tests bypass the network). */
  provider?: ResearchProvider;
  /** Injectable FMP fundamentals fallback provider (tests bypass the network). */
  fmpProvider?: ResearchProvider;
  robinhoodConnected?: boolean;
  dailyCap?: number;
}

/** Pure merge: Robinhood preferred for fundamentals/profile (field-by-field),
 *  Perplexity fills gaps and supplies consensus + the AI summary, FMP fills
 *  cashFlow/dividend/fundamentals when Perplexity did not supply value data. */
export function mergeSymbolResearch(args: {
  rh: { fundamentals: ResearchFundamentals; profile: ResearchProfile } | null;
  perplexity: ResearchResult | null;
  fmp: ResearchResult | null;
  robinhoodConnected: boolean;
  perplexityStatus: PerplexityStatus;
  perplexityReason: string | null;
}): SymbolResearch {
  const { rh, perplexity, fmp, robinhoodConnected, perplexityStatus, perplexityReason } = args;
  const rf = rh?.fundamentals ?? null;
  const pf = perplexity?.fundamentals ?? null;
  const ff = fmp?.fundamentals ?? null;
  const fundamentals: ResearchFundamentals | null =
    rf || pf || ff
      ? {
          marketCap: rf?.marketCap ?? pf?.marketCap ?? ff?.marketCap ?? null,
          peRatio: rf?.peRatio ?? pf?.peRatio ?? ff?.peRatio ?? null,
          eps: rf?.eps ?? pf?.eps ?? ff?.eps ?? null,
          dividendYield: rf?.dividendYield ?? pf?.dividendYield ?? ff?.dividendYield ?? null,
        }
      : null;

  const rp = rh?.profile ?? null;
  const pp = perplexity?.profile ?? null;
  const fp = fmp?.profile ?? null;
  const profile: ResearchProfile | null =
    rp || pp || fp
      ? {
          name: rp?.name ?? pp?.name ?? fp?.name ?? null,
          domain: rp?.domain ?? pp?.domain ?? fp?.domain ?? null,
          ceo: rp?.ceo ?? pp?.ceo ?? fp?.ceo ?? null,
          employees: rp?.employees ?? pp?.employees ?? fp?.employees ?? null,
          sector: rp?.sector ?? pp?.sector ?? fp?.sector ?? null,
          industry: rp?.industry ?? pp?.industry ?? fp?.industry ?? null,
          country: rp?.country ?? pp?.country ?? fp?.country ?? null,
          exchange: rp?.exchange ?? pp?.exchange ?? fp?.exchange ?? null,
          ipoDate: rp?.ipoDate ?? pp?.ipoDate ?? fp?.ipoDate ?? null,
          description: rp?.description ?? pp?.description ?? fp?.description ?? null,
        }
      : null;

  const cashFlow = perplexity?.cashFlow ?? fmp?.cashFlow ?? null;
  const dividend = perplexity?.dividend ?? fmp?.dividend ?? null;

  return {
    fundamentals,
    fundamentalsSource: rf ? "robinhood" : pf ? "perplexity" : ff ? "fmp" : null,
    profile,
    profileSource: rp ? "robinhood" : pp ? "perplexity" : fp ? "fmp" : null,
    consensus: perplexity?.consensus ?? null,
    summary: perplexity?.summary ?? "",
    earnings: perplexity?.earnings ?? [],
    catalysts: perplexity?.catalysts ?? [],
    cashFlow,
    cashFlowSource: perplexity?.cashFlow ? "perplexity" : fmp?.cashFlow ? "fmp" : null,
    dividend,
    dividendSource: perplexity?.dividend ? "perplexity" : fmp?.dividend ? "fmp" : null,
    finance: perplexity?.finance ?? [],
    sections: buildFinanceSections(perplexity?.finance ?? []),
    categories: perplexity?.categories ?? [],
    sources: perplexity?.sources ?? [],
    usedAt: perplexity?.usedAt ?? null,
    cost: perplexity?.cost ?? null,
    robinhoodConnected,
    perplexity: perplexityStatus,
    perplexityReason,
    cached: false,
    fetchedAt: null,
  };
}

/**
 * Read ONLY the cached research freshness for a symbol — **never fetches**, so
 * it is safe to call for many symbols at once (e.g. the proposals page) without
 * spending a metered call. Returns `fetchedAt: null` when nothing is cached.
 */
export async function getResearchFreshness(
  symbol: string,
  opts?: { dataDir?: string },
): Promise<{ fetchedAt: string | null }> {
  const cached = await readResearchCache(symbol, { dataDir: opts?.dataDir });
  return { fetchedAt: cached?.fetchedAt ?? null };
}

/**
 * A symbol's GICS sector from the **cache only** (no fetch, no spend) for the
 * concentration rail. Returns null when the symbol isn't cached or carries no
 * sector — the rail then simply can't fire for that name.
 */
export async function getCachedSector(
  symbol: string,
  opts?: { dataDir?: string },
): Promise<string | null> {
  const cached = await readResearchCache(symbol, { dataDir: opts?.dataDir });
  return cached?.profile?.sector ?? null;
}

export async function getSymbolResearch(
  symbol: string,
  opts?: GetSymbolResearchOpts,
): Promise<SymbolResearch> {
  const now = opts?.now?.() ?? new Date();
  const date = now.toISOString().slice(0, 10);
  const dataDir = opts?.dataDir;
  const maxAgeMs = opts?.maxAgeMs ?? RESEARCH_MAX_AGE_MS;

  // Freshness policy: serve the cached entry unless it is older than the soft
  // max-age or the caller forced a manual refresh. Crossing midnight no longer
  // re-spends — only age or an explicit Refresh does.
  const cached = await readResearchCache(symbol, { dataDir });
  if (cached && !opts?.force) {
    const age = now.getTime() - Date.parse(cached.fetchedAt ?? "");
    if (Number.isFinite(age) && age >= 0 && age <= maxAgeMs) return cached;
  }

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

  const diag = provider.lastDiagnostic?.() ?? null;
  let perplexityStatus: PerplexityStatus;
  let perplexityReason: string | null = null;
  if (!providerOn) {
    perplexityStatus = "off";
  } else if (pplx) {
    perplexityStatus = "ok";
  } else if (diag) {
    perplexityStatus = diagnosticToStatus(diag);
    perplexityReason = researchReasonText(diag);
  } else {
    // Fallback when the provider exposes no diagnostic (e.g. a test fake).
    const cap =
      opts?.dailyCap ?? Number(process.env.PERPLEXITY_DAILY_CALL_CAP ?? "30");
    const used = await getResearchCallCount(date, { dataDir });
    perplexityStatus = used >= cap ? "capped" : "unavailable";
  }

  // FMP fallback (harden-research-fallback M2): spend an FMP call whenever the
  // VALUE-quality data (cashFlow/dividend) is missing — even if Perplexity did
  // parse some fundamentals. The prior guard also required `fundamentals` to be
  // null, so a partial or truncated Perplexity result (fundamentals present, the
  // cashFlow/dividend tail cut off — the LLY failure) skipped FMP and left the
  // value lens "data unavailable". A truncated fetch now returns null entirely
  // (research-output-completes M1), so `!pplx?.cashFlow && !pplx?.dividend`
  // covers both that and the partial case; FMP fundamentals never override
  // Perplexity's (the merge prefers Perplexity), so this only fills the gap.
  const needFmp = !pplx?.cashFlow && !pplx?.dividend;
  const fmpProvider = opts?.fmpProvider ?? getFundamentalsFallbackProvider();
  const fmpOn = fmpProvider.name !== "off";
  const fmp =
    needFmp && fmpOn
      ? await Promise.resolve(fmpProvider.research({ symbol })).catch(() => null)
      : null;

  const merged = mergeSymbolResearch({
    rh,
    perplexity: pplx,
    fmp,
    robinhoodConnected,
    perplexityStatus,
    perplexityReason,
  });

  // Only cache a payload that carries real data — never pin a transient failure
  // (or a plain "off/capped with nothing").
  const hasData =
    merged.fundamentals ||
    merged.profile ||
    merged.consensus ||
    merged.summary ||
    merged.cashFlow ||
    merged.dividend;
  if (hasData) {
    const fetchedAt = now.toISOString();
    await writeResearchCache(symbol, merged, fetchedAt, { dataDir });
    return { ...merged, fetchedAt };
  }

  // A refetch that came back empty (e.g. the daily cap was hit) must not wipe a
  // good prior cache: keep the cached data, surface the fresh status flag.
  if (cached) {
    return { ...cached, perplexity: merged.perplexity, perplexityReason: merged.perplexityReason };
  }
  return merged;
}
