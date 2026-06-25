import "server-only";

import { buildUniverse, type TrackedUniverse } from "@/lib/universe";
import type { ViewMode } from "@/lib/mode";
import { getLiveAccount, getPaperAccount } from "./account";
import { readLatestSnapshot, readWatchlist } from "./data";

/**
 * Server assembly of the tracked universe (see `@/lib/universe` for the pure
 * helpers). Two shapes:
 *
 * - {@link getTrackedUniverse} — the **active book's** holdings + watchlist,
 *   for the mode-aware pages (News filtering, the watchlist editor, ownership
 *   badges). Mirrors the account the page is already showing.
 * - {@link getScoutSymbols} — the **global** universe across BOTH books'
 *   holdings + the watchlist, for the news scout and research routine. The
 *   scout is not mode-scoped: it must watch live holdings too (the previously
 *   flagged gap), so it reads the persisted paper *and* live snapshots.
 */
export async function getTrackedUniverse(
  mode: ViewMode,
): Promise<TrackedUniverse> {
  const [account, watchlist] = await Promise.all([
    mode === "live" ? getLiveAccount() : getPaperAccount(),
    readWatchlist(),
  ]);
  const holdings = account.snapshot?.positions.map((p) => p.symbol) ?? [];
  return buildUniverse(holdings, watchlist);
}

/** The full set of symbols the scout/research should watch: both books'
 *  held names + the manual watchlist, normalized + deduped. Reads the persisted
 *  snapshots (light, no Alpaca/CLI calls) so it is safe to run on an interval. */
export async function getScoutSymbols(): Promise<string[]> {
  const [paper, live, watchlist] = await Promise.all([
    readLatestSnapshot("paper"),
    readLatestSnapshot("live"),
    readWatchlist(),
  ]);
  const holdings = [
    ...(paper?.positions ?? []),
    ...(live?.positions ?? []),
  ].map((p) => p.symbol);
  return buildUniverse(holdings, watchlist).symbols;
}
