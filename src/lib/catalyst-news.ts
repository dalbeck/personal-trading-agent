/**
 * Catalyst extraction from **news headlines** (catalyst-news-sources M1). The
 * desk's catalyst pipeline was single-sourced on Perplexity; when that fetch
 * failed, a catalyst-rich name (e.g. LLY's CHMP approval + Medicare GLP-1 program
 * + analyst target raises) was seen as "no catalyst" and the red-team rejected an
 * otherwise-clean breakout for the wrong reason. Alpaca's News API (free,
 * Benzinga-powered, no daily cap) is now a **primary** catalyst source: this pure
 * module scans recent headlines for a specific why-now (regulatory/FDA/EMA, M&A,
 * earnings, guidance, analyst actions, product/clinical, Medicare/policy), picks
 * the newest material one as the catalyst, classifies it, and **lists the
 * contributing headlines as sources** (headline + publisher + time) so the
 * catalyst is verifiable.
 *
 * Plain module (no `server-only`) so it is pure + unit-tested. The server
 * orchestrator (`src/lib/server/catalyst-capture.ts`) maps Alpaca's payload into
 * `CatalystNewsItem` and feeds it here.
 */
import { truncateOnWord } from "@/lib/truncate";
import { classifyCatalyst, isCompanyDescription } from "@/lib/catalyst-extract";
import type { CatalystType } from "@/lib/catalyst";
import type { CatalystSource } from "@/lib/types";

/** A news item, normalized from the Alpaca News payload (`source` → `publisher`,
 *  `created_at` → `publishedAt`). Mirrors the `CatalystSource` shape so a kept
 *  headline becomes a source with no further mapping. */
export interface CatalystNewsItem {
  headline: string;
  publisher: string;
  url: string | null;
  publishedAt: string | null;
}

/** A catalyst phrase is kept this short for display (word-truncated). */
const CATALYST_MAX = 160;

/** At most this many headlines are surfaced as sources on a proposal. */
const MAX_SOURCES = 6;

/**
 * Keywords that mark a headline as a **material catalyst** — a concrete why-now,
 * not a market wrap or a listicle. Regulatory/clinical, M&A, earnings, guidance,
 * analyst actions, product/contract news, and policy/Medicare all qualify. This
 * is the materiality gate; the kept phrase is then bucketed by `classifyCatalyst`.
 */
const CATALYST_KEYWORDS =
  /\b(fda|ema|chmp|approv\w*|clears?|cleared|authoriz\w*|regulatory|phase\s?[123]|trial|clinical|breakthrough|recall|acquir\w*|acquisition|merger|to buy|buyout|takeover|deal|stake|earnings|eps|beat|misses?|missed|revenue|profit|loss|guidance|outlook|forecast|raises?|raised|lowers?|cuts?|reaffirm\w*|reiterat\w*|upgrad\w*|downgrad\w*|analyst|price target|initiat\w*|rating|contract|partnership|collaborat\w*|launch\w*|unveil\w*|recommend\w*|medicare|medicaid|policy|reimburs\w*|lawsuit|settlement|investigat\w*|dividend|buyback|repurchase|split|guides?|wins?|awarded?|secures?)\b/i;

/**
 * Listicle / market-wrap noise that can trip a catalyst keyword (e.g. a "3
 * dividend stocks to consider" roundup contains "dividend") but is not a concrete
 * why-now for THIS symbol. Vetoes materiality.
 */
const NOISE_PATTERNS =
  /(\bstocks\s+to\s+(buy|watch|consider|own)\b|\bhere'?s\s+(what|why|how)\b|\bwhat\s+to\s+watch\b|\b\d+\s+\w+\s+stocks?\b|\bmarket\s+(wrap|recap|roundup)\b|\bstocks?\s+(mixed|edge|slip|rise|fall|gain|drop|close)\b|\bmidday\b|\bpremarket movers\b)/i;

/** True when a headline reads like a concrete, material catalyst. Generic
 *  market-wrap / listicle headlines (no catalyst keyword, or a noise pattern)
 *  return false. */
export function isMaterialHeadline(headline: string): boolean {
  const s = (headline ?? "").trim();
  if (!s) return false;
  if (isCompanyDescription(s)) return false; // a profile blurb is not a why-now
  if (NOISE_PATTERNS.test(s)) return false; // a roundup/wrap is not a why-now
  return CATALYST_KEYWORDS.test(s);
}

export interface CapturedNewsCatalyst {
  catalyst: string | null;
  catalystType: CatalystType | null;
  sources: CatalystSource[];
}

/**
 * Pull a catalyst out of recent news headlines (newest first). Keeps only the
 * **material** headlines, derives the catalyst from the newest one (word-truncated
 * + classified), and surfaces the material headlines as verifiable sources. When
 * nothing material is present (only noise, or an empty payload) it returns a null
 * catalyst with no sources — the caller then distinguishes "searched, none found"
 * from a failed fetch (catalyst-state-honesty M2).
 */
export function extractCatalystFromNews(
  items: CatalystNewsItem[] | null | undefined,
): CapturedNewsCatalyst {
  const material = (items ?? []).filter((it) => isMaterialHeadline(it.headline));
  if (material.length === 0) {
    return { catalyst: null, catalystType: null, sources: [] };
  }
  const top = material[0];
  const sources: CatalystSource[] = material.slice(0, MAX_SOURCES).map((it) => ({
    headline: it.headline.trim(),
    publisher: it.publisher,
    url: it.url,
    publishedAt: it.publishedAt,
  }));
  return {
    catalyst: truncateOnWord(top.headline, CATALYST_MAX),
    catalystType: classifyCatalyst(top.headline),
    sources,
  };
}
