import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";

/**
 * The **tracked universe** = the active book's current holdings + the manual
 * watchlist. It is what the news scout watches and the research routine scans,
 * and it drives symbol auto-surfacing (an owned/watched symbol gets a badge in
 * News, Activity, and the symbol detail view).
 *
 * Pure helpers live here (no `server-only`) so client components can classify a
 * symbol's ownership without a round-trip. The server assembles the universe
 * from snapshots/watchlist in `src/lib/server/universe.ts`.
 */
export interface TrackedUniverse {
  /** Symbols currently held in the relevant book(s). */
  holdings: string[];
  /** The manual watchlist symbols. */
  watchlist: string[];
  /** Union of holdings + watchlist, normalized and deduped (holdings first). */
  symbols: string[];
}

/** How a symbol relates to the tracked universe — drives the surfacing badge. */
export type Ownership = "held" | "watchlist" | "none";

/** Normalize (upper-case/trim), drop invalid tickers, and dedupe — preserving
 *  first-seen order. Used everywhere a symbol list is assembled or merged. */
export function dedupeSymbols(symbols: Iterable<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of symbols) {
    if (typeof raw !== "string") continue;
    const s = normalizeSymbol(raw);
    if (!isValidSymbol(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Build a tracked universe from a book's holdings and the manual watchlist.
 *  Holdings lead the union so owned names sort first. */
export function buildUniverse(
  holdings: Iterable<string>,
  watchlist: Iterable<string>,
): TrackedUniverse {
  const h = dedupeSymbols(holdings);
  const w = dedupeSymbols(watchlist);
  return { holdings: h, watchlist: w, symbols: dedupeSymbols([...h, ...w]) };
}

/** Classify a symbol against a universe: held wins over watchlist over none. */
export function classifyOwnership(
  symbol: string,
  universe: TrackedUniverse,
): Ownership {
  const s = normalizeSymbol(symbol);
  if (universe.holdings.includes(s)) return "held";
  if (universe.watchlist.includes(s)) return "watchlist";
  return "none";
}

/** Is the symbol part of the tracked universe at all (held or watched)? */
export function isTracked(symbol: string, universe: TrackedUniverse): boolean {
  return classifyOwnership(symbol, universe) !== "none";
}
