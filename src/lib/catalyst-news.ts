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
 * Regex that identifies multi-ticker roundups / listicles / market-wrap
 * headlines. Used both to veto `isMaterialHeadline` and as the implementation
 * of `isMultiTickerRoundup`. Kept as a single source of truth so strengthening
 * it here is automatically reflected in both.
 *
 * Key design decisions:
 * - `\b\d+\s+stocks?` requires digits before "stocks" (singular or plural) to
 *   avoid matching "upgrades stock to Buy".
 * - `\bstocks\s+to\s+(buy|watch|consider|own|sell)\b` uses plural "stocks"
 *   without a count to catch "Stocks To Watch" listicles.
 * - `\band\s+\d+\s+other\s+(stock|name|compan)` catches "And 4 Other Stocks".
 * - `\bmoving\s+(higher|lower)\b` catches standalone movers phrasing.
 */
const ROUNDUP_PATTERNS =
  /(\bstocks\s+to\s+(buy|watch|consider|own|sell)\b|\bhere'?s\s+(what|why|how)\b|\bwhat\s+to\s+watch\b|\b\d+\s+\w+\s+stocks?\b|\bmarket\s+(wrap|recap|roundup)\b|\bstocks?\s+(mixed|edge|slip|rise|fall|gain|drop|close)\b|\bmidday\b|\bpremarket movers\b|\b\d+\s+stocks?\s+(moving|trading|making|to\s+(buy|watch|consider|own|sell)|that|are|in)\b|\bstocks?\s+(moving|trading|making)\b|\band\s+\d+\s+other\s+(stock|name|compan)\w*\b|\bmoving\s+(higher|lower)\b|\btrending\s+stocks?\b|\bmid-?day\s+(session|movers?)\b|\bbiggest\s+movers?\b|\bstocks?\s+to\s+watch\b)/i;

/**
 * Returns true when the headline is a multi-ticker roundup / listicle /
 * market-movers headline where no single symbol is the primary subject.
 * Examples: "Apogee Therapeutics And 4 Other Stocks Moving Higher Wednesday",
 * "10 Stocks Moving In Tuesday's Mid-Day Session", "Trending Stocks Today".
 */
export function isMultiTickerRoundup(headline: string): boolean {
  const s = (headline ?? "").trim();
  if (!s) return false;
  return ROUNDUP_PATTERNS.test(s);
}

/** True when a headline reads like a concrete, material catalyst. Generic
 *  market-wrap / listicle headlines (no catalyst keyword, or a roundup pattern)
 *  return false. */
export function isMaterialHeadline(headline: string): boolean {
  const s = (headline ?? "").trim();
  if (!s) return false;
  if (isCompanyDescription(s)) return false; // a profile blurb is not a why-now
  if (ROUNDUP_PATTERNS.test(s)) return false; // a roundup/wrap is not a why-now
  return CATALYST_KEYWORDS.test(s);
}

/**
 * Legal-entity suffixes stripped iteratively from a company name to produce a
 * "core" name for matching (e.g. "Eli Lilly, Inc." → "Eli Lilly").
 */
const LEGAL_SUFFIX_RE =
  /,?\s*(incorporated|corporation|inc|corp|co|ltd|plc|sa|nv|ag|holdings?|group|company|the)\.?\s*$/i;

/**
 * Tokens that are too generic to use alone as a last-significant-token match.
 * If the last word of the stripped core is one of these, we do NOT attempt a
 * single-token match (it would produce too many false positives).
 */
const GENERIC_TOKENS = new Set([
  "group",
  "holdings",
  "technologies",
  "therapeutics",
  "inc",
  "company",
  "corp",
  "corporation",
  "co",
  "ltd",
  "plc",
]);

/**
 * Returns true if `headline` (case-insensitive) contains the company name or
 * its last significant token. Handles legal-suffix stripping (e.g. "Eli Lilly,
 * Inc." → core "Eli Lilly"; last token "Lilly").
 *
 * Possessives and word boundaries are handled: "Lilly's" matches via the `\b`
 * anchor because the apostrophe is a non-word character.
 *
 * Guard: returns false on empty/whitespace headline or company name.
 */
export function companyNameMatches(
  headline: string,
  companyName: string,
): boolean {
  const h = (headline ?? "").trim();
  const cn = (companyName ?? "").trim();
  if (!h || !cn) return false;

  // Iteratively strip legal suffixes to get the core name.
  let core = cn;
  let prev: string;
  do {
    prev = core;
    core = core.replace(LEGAL_SUFFIX_RE, "").trim();
  } while (core !== prev);

  if (!core) return false;

  // Escape for use in a regex.
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Full core match (word-boundary on both ends).
  const coreRe = new RegExp(`\\b${escapeRe(core)}\\b`, "i");
  if (coreRe.test(h)) return true;

  // Last significant token match (length ≥ 4, not a generic token).
  const tokens = core.split(/\s+/);
  const lastToken = tokens[tokens.length - 1] ?? "";
  if (
    lastToken.length >= 4 &&
    !GENERIC_TOKENS.has(lastToken.toLowerCase())
  ) {
    const tokenRe = new RegExp(`\\b${escapeRe(lastToken)}\\b`, "i");
    if (tokenRe.test(h)) return true;
  }

  return false;
}

/**
 * Returns true when the headline is about THIS symbol as the primary subject.
 * Roundups are always rejected. When `companyName` is provided, the company
 * name must appear in the headline. When it is absent/null/undefined, the
 * function is permissive (returns true for any non-roundup headline).
 */
export function isSymbolPrimarySubject(
  headline: string,
  opts: { companyName?: string | null },
): boolean {
  if (isMultiTickerRoundup(headline)) return false;
  if (opts.companyName) return companyNameMatches(headline, opts.companyName);
  return true;
}

/**
 * Rates the headline on a 0–3 materiality scale:
 *   0 — not material (fails `isMaterialHeadline`)
 *   3 — regulatory / clinical / M&A event
 *   2 — guidance / analyst / earnings / product / policy
 *   1 — any other material keyword
 */
export function headlineMateriality(headline: string): number {
  if (!isMaterialHeadline(headline)) return 0;

  // TIER_3 regex: Regulatory / clinical / M&A events (highest materiality).
  // Intentionally omits "to buy" (analyst rating phrase, produces false positives
  // with "Raised To Buy") and "deal" (too generic, causes "good deal"/"deal with"
  // false positives). Genuine acquisitions are already caught by acquir|acquisition|
  // merger|buyout|takeover.
  const TIER_3 =
    /\b(fda|ema|chmp|approv\w*|clears?|cleared|authoriz\w*|breakthrough|phase\s?[123]|trial|clinical|acqui(r\w*|sition)|merger|buyout|takeover)\b/i;
  const TIER_2 =
    /\b(guidance|outlook|forecast|raises?|raised|reaffirm\w*|reiterat\w*|upgrad\w*|downgrad\w*|price target|initiat\w*|rating|analyst|earnings|eps|beat|miss|revenue|guides?|medicare|medicaid|reimburs\w*|contract|partnership|collaborat\w*|launch\w*|unveil\w*|dividend|buyback|repurchase)\b/i;

  if (TIER_3.test(headline)) return 3;
  if (TIER_2.test(headline)) return 2;
  return 1;
}

export interface CapturedNewsCatalyst {
  catalyst: string | null;
  catalystType: CatalystType | null;
  sources: CatalystSource[];
}

/**
 * Pull a catalyst out of recent news headlines (newest first). Keeps only
 * **material** headlines where the symbol is the **primary subject** (roundups
 * and co-tagged cross-listed headlines are excluded). Ranks the survivors by
 * materiality descending, then recency (original index ascending — lower index
 * = newer), picks the top headline as the catalyst, classifies it, and surfaces
 * the ranked set as verifiable sources.
 *
 * When no symbol-primary material headline exists (e.g. only roundups mention
 * the symbol), returns a null catalyst with no sources so the caller falls
 * through to Perplexity — never crashes, never surfaces a roundup.
 */
export function extractCatalystFromNews(
  items: CatalystNewsItem[] | null | undefined,
  opts: { symbol: string; companyName?: string | null },
): CapturedNewsCatalyst {
  const material = (items ?? []).filter((it) => isMaterialHeadline(it.headline));
  const primary = material.filter((it) =>
    isSymbolPrimarySubject(it.headline, { companyName: opts.companyName }),
  );
  if (primary.length === 0) {
    return { catalyst: null, catalystType: null, sources: [] };
  }
  // Rank: materiality desc, then recency (input is newest-first, so lower index
  // = newer — use it as a stable tiebreak).
  const ranked = primary
    .map((it, i) => ({ it, i, score: headlineMateriality(it.headline) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const top = ranked[0].it;
  const sources: CatalystSource[] = ranked.slice(0, MAX_SOURCES).map(({ it }) => ({
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
