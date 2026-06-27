import "server-only";

import { getStockNews } from "@/lib/server/alpaca";
import {
  extractCatalystFromNews,
  type CatalystNewsItem,
} from "@/lib/catalyst-news";
import { extractCatalyst } from "@/lib/catalyst-extract";
import type { CatalystType } from "@/lib/catalyst";
import type { CatalystSource } from "@/lib/types";

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
 * null only when BOTH sources genuinely had nothing material. Distinguishing a
 * failed fetch from a real "none found" is catalyst-state-honesty (M2).
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
}

export interface CaptureCatalystOpts {
  symbol: string;
  /** Perplexity's structured catalyst phrases (from `getSymbolResearch`). */
  perplexityCatalysts?: string[] | null;
  /** Injectable Alpaca News fetch (returns normalized items). Defaults to a live
   *  Alpaca read mapped from its payload. */
  fetchNews?: (symbol: string) => Promise<CatalystNewsItem[]>;
  /** How many EXTRA attempts to make when the news fetch throws (default 1). */
  newsRetries?: number;
  /** How many recent headlines to pull from Alpaca News. */
  newsLimit?: number;
}

const EMPTY: CapturedCatalyst = {
  catalyst: null,
  catalystType: null,
  sources: [],
  source: null,
};

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
  const news = await fetchNewsWithRetry(fetchNews, opts.symbol, retries);
  if (news) {
    const fromNews = extractCatalystFromNews(news);
    if (fromNews.catalyst) {
      return {
        catalyst: fromNews.catalyst,
        catalystType: fromNews.catalystType,
        sources: fromNews.sources,
        source: "alpaca-news",
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
    };
  }

  // Both sources were unavailable or immaterial — a null catalyst (M2 refines the
  // "searched, none found" vs "fetch failed" distinction).
  return EMPTY;
}
