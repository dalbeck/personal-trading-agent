import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SymbolResearch } from "./types";

/**
 * Per-symbol cache for the merged symbol-research payload. Auto-loading the
 * symbol page would otherwise re-spend a Perplexity call (real $) and a slow
 * Robinhood CLI read on every visit; caching the result makes the first view pay
 * and the rest free.
 *
 * **Freshness, not day-expiry.** The entry is keyed by **symbol only** (not
 * symbol+date) and carries a `fetchedAt` timestamp. The *expiry policy* lives in
 * `getSymbolResearch` (serve unless older than a soft max-age, or a manual
 * refresh forces it) — this module just persists and returns the latest entry
 * with its age, so the UI can show "fetched N ago" and offer a Refresh. Crossing
 * midnight no longer silently re-spends.
 *
 * An internal state file (like the usage counter / halt latch), NOT a `data/`
 * artifact contract — written by us, read best-effort. A malformed or unreadable
 * cache entry is treated as a miss, never an error.
 */

/** Bump when the cached shape changes so stale entries are re-fetched, not
 *  served with missing fields. v5 re-keyed the cache by symbol (dropping the
 *  date from the filename) and added the `fetchedAt` freshness stamp; v6 added
 *  the value-lens `cashFlow` block (value-cashflow M1); v7 added the `dividend`
 *  block (dividend-floor M1); v8 added the `perplexityReason` field
 *  (research-observability M1); v9 added `cashFlowSource`/`dividendSource` for
 *  the FMP fallback (fundamentals-fallback-fmp M2); v10 busts entries cached
 *  while Perplexity truncation silently stored null cashFlow/dividend as a clean
 *  "ok" success — they re-fetch with the raised output cap + truncation guard
 *  (research-output-completes M1). */
const CACHE_VERSION = 10;

function cacheFile(symbol: string, dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "research", "cache", `${symbol}.json`);
}

/** Read a symbol's cached research (any age), or null on miss / unreadable /
 *  stale-shape. The returned copy is marked `cached: true` and carries the
 *  stored `fetchedAt`; the caller decides whether it is fresh enough to serve. */
export async function readResearchCache(
  symbol: string,
  opts?: { dataDir?: string },
): Promise<SymbolResearch | null> {
  try {
    const raw = await readFile(cacheFile(symbol, opts?.dataDir), "utf8");
    const parsed = JSON.parse(raw) as SymbolResearch & {
      version?: number;
      fetchedAt?: string;
    };
    // Minimal shape check + version gate — a stale-shape entry is a miss, so it
    // gets re-fetched with the current fields rather than served half-empty.
    if (
      parsed &&
      typeof parsed === "object" &&
      "perplexity" in parsed &&
      parsed.version === CACHE_VERSION &&
      typeof parsed.fetchedAt === "string"
    ) {
      return { ...parsed, cached: true };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist a symbol's merged research, stamped with `fetchedAt`. Best-effort;
 *  never throws (a cache write must never break the page). */
export async function writeResearchCache(
  symbol: string,
  value: SymbolResearch,
  fetchedAt: string,
  opts?: { dataDir?: string },
): Promise<void> {
  try {
    const file = cacheFile(symbol, opts?.dataDir);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify(
        { ...value, fetchedAt, cached: false, version: CACHE_VERSION },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } catch {
    // A cache write failure must never break the page.
  }
}
