import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SymbolResearch } from "./types";

/**
 * Per-symbol, per-day cache for the merged symbol-research payload. Auto-loading
 * the symbol page would otherwise re-spend a Perplexity call (real $) and a slow
 * Robinhood CLI read on every refresh / navigate-away-and-back; caching the
 * result for the calendar day makes the first view pay and the rest free.
 *
 * An internal state file (like the usage counter / halt latch), NOT a `data/`
 * artifact contract — written by us, read best-effort. A malformed or unreadable
 * cache entry is treated as a miss, never an error.
 */

function cacheFile(symbol: string, date: string, dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "research", "cache", `${date}-${symbol}.json`);
}

/** Read today's cached research for a symbol, or null on miss / unreadable. */
export async function readResearchCache(
  symbol: string,
  date: string,
  opts?: { dataDir?: string },
): Promise<SymbolResearch | null> {
  try {
    const raw = await readFile(cacheFile(symbol, date, opts?.dataDir), "utf8");
    const parsed = JSON.parse(raw) as SymbolResearch;
    // Minimal shape check — our own writes, so trust but verify the marker.
    if (parsed && typeof parsed === "object" && "perplexity" in parsed) {
      return { ...parsed, cached: true };
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist today's merged research for a symbol. Best-effort; never throws. */
export async function writeResearchCache(
  symbol: string,
  date: string,
  value: SymbolResearch,
  opts?: { dataDir?: string },
): Promise<void> {
  try {
    const file = cacheFile(symbol, date, opts?.dataDir);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify({ ...value, cached: false }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    // A cache write failure must never break the page.
  }
}
