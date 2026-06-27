import "server-only";

import { getStockNews } from "@/lib/server/alpaca";
import {
  extractCatalystFromNews,
  type CatalystNewsItem,
} from "@/lib/catalyst-news";
import { extractCatalyst } from "@/lib/catalyst-extract";
import type { CatalystType } from "@/lib/catalyst";
import type { CatalystSource, CatalystState, ResearchStatus } from "@/lib/types";

/**
 * Multi-source catalyst capture with a retry/fallback chain
 * (catalyst-news-sources M1). The catalyst pipeline was single-sourced on
 * Perplexity; when that fetch failed, a catalyst-rich name (LLY's CHMP approval,
 * Medicare GLP-1 program, analyst target raises) was treated as "no catalyst" and
 * the red-team rejected a clean breakout for the wrong reason. The fix:
 *
 *   1. **Alpaca News (primary)** — free, Benzinga-powered, no daily cap. Recent
 *      headlines are scanned for a specific why-now and surfaced as **sources**
 *      (headline + publisher + time) so the catalyst is verifiable.
 *   2. **Perplexity catalysts (fallback)** — the curated why-now phrases from the
 *      deeper (capped) research fetch, used when news is unavailable / immaterial.
 *
 * **A failed source never yields "no catalyst":** the news fetch is retried and,
 * on persistent failure, the chain falls through to Perplexity. The catalyst is
 * null only when BOTH sources genuinely had nothing material.
 *
 * **Three-state honesty (M2):** the capture also reports a `state` —
 *   - `found` — a named catalyst (from either source);
 *   - `none` — at least one source was successfully searched but nothing material;
 *   - `unavailable` — every source's fetch FAILED, so the catalyst is unverified,
 *     NOT absent. The red-team must not reject for "no catalyst" on `unavailable`.
 *
 * Side effects are isolated behind the injectable `fetchNews` seam so the chain
 * is unit-tested without the network.
 */

export type CatalystSourceName = "alpaca-news" | "perplexity";

export interface CapturedCatalyst {
  catalyst: string | null;
  catalystType: CatalystType | null;
  /** The headlines that informed the catalyst (Alpaca News only — Perplexity
   *  phrases carry no headline attribution). Empty when none. */
  sources: CatalystSource[];
  /** Which source supplied the catalyst, or null when none did. */
  source: CatalystSourceName | null;
  /** found / none / unavailable (catalyst-state-honesty M2) — a failed fetch is
   *  `unavailable`, NEVER conflated with a real `none`. */
  state: CatalystState;
}

export interface CaptureCatalystOpts {
  symbol: string;
  /** The company display name (e.g. "Eli Lilly, Inc."), threaded so
   *  symbol-primary-subject filtering works on headlines that name the company
   *  rather than the ticker. When present, only headlines that mention the company
   *  name (or its last significant token) are treated as symbol-primary.
   *  (catalyst-selection-quality M3) */
  companyName?: string | null;
  /** Perplexity's structured catalyst phrases (from `getSymbolResearch`). */
  perplexityCatalysts?: string[] | null;
  /** Whether the Perplexity research itself was successfully obtained
   *  (catalyst-state-honesty M2). Only `ok` counts as "Perplexity was searched";
   *  off/capped/unavailable mean it did NOT search, so if news also failed the
   *  state is `unavailable` (fetch failed), not `none` (searched, none found). */
  perplexityStatus?: ResearchStatus | null;
  /** Injectable Alpaca News fetch (returns normalized items). Defaults to a live
   *  Alpaca read mapped from its payload. */
  fetchNews?: (symbol: string) => Promise<CatalystNewsItem[]>;
  /** How many EXTRA attempts to make when the news fetch throws (default 1). */
  newsRetries?: number;
  /** How many recent headlines to pull from Alpaca News. */
  newsLimit?: number;
}

/** Default news seam: Alpaca's free News API, mapped into `CatalystNewsItem`. */
async function defaultFetchNews(
  symbol: string,
  limit: number,
): Promise<CatalystNewsItem[]> {
  const items = await getStockNews(symbol, limit);
  return items.map((n) => ({
    headline: n.headline,
    publisher: n.source,
    url: n.url || null,
    publishedAt: n.created_at,
  }));
}

/** Fetch news with a small retry; resolves to `null` (not throw) once exhausted,
 *  so the caller falls through to the next source rather than failing the run. */
async function fetchNewsWithRetry(
  fetchNews: (symbol: string) => Promise<CatalystNewsItem[]>,
  symbol: string,
  retries: number,
): Promise<CatalystNewsItem[] | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchNews(symbol);
    } catch {
      // keep retrying until the budget is spent, then fall back
    }
  }
  return null;
}

export async function captureCatalyst(
  opts: CaptureCatalystOpts,
): Promise<CapturedCatalyst> {
  const retries = opts.newsRetries ?? 1;
  const limit = opts.newsLimit ?? 10;
  const fetchNews =
    opts.fetchNews ?? ((s: string) => defaultFetchNews(s, limit));

  // 1) Alpaca News (primary catalyst source) — retried, then abandoned on failure.
  //    `null` = the fetch FAILED (never searched); `[]` = searched, nothing there.
  const news = await fetchNewsWithRetry(fetchNews, opts.symbol, retries);
  const newsSearched = news !== null;
  if (news) {
    const fromNews = extractCatalystFromNews(news, { symbol: opts.symbol, companyName: opts.companyName });
    if (fromNews.catalyst) {
      return {
        catalyst: fromNews.catalyst,
        catalystType: fromNews.catalystType,
        sources: fromNews.sources,
        source: "alpaca-news",
        state: "found",
      };
    }
  }

  // 2) Perplexity catalysts (fallback) — the deeper research's curated why-now
  //    phrases. No headline attribution, so sources stay empty.
  const fromPplx = extractCatalyst(opts.perplexityCatalysts);
  if (fromPplx) {
    return {
      catalyst: fromPplx.catalyst,
      catalystType: fromPplx.catalystType,
      sources: [],
      source: "perplexity",
      state: "found",
    };
  }

  // Nothing material. Distinguish "searched, none found" from "fetch failed":
  // a source counts as SEARCHED only if it actually returned (news fetch ok, or
  // Perplexity status `ok`). If NEITHER searched, the catalyst is `unavailable`
  // (a failed fetch) — NOT a real `none` — so the red-team isn't told "no catalyst".
  const perplexitySearched = opts.perplexityStatus === "ok";
  const state: CatalystState =
    newsSearched || perplexitySearched ? "none" : "unavailable";
  return { catalyst: null, catalystType: null, sources: [], source: null, state };
}
