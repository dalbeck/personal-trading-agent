import "server-only";

import { getStockSnapshot, hasAlpacaCredentials } from "@/lib/server/alpaca";
import type { PortfolioSnapshot, Position } from "@/lib/types";

/**
 * Robinhood's position data carries quantity + average cost but **no current
 * price** (that needs a live quote), so a freshly-read live snapshot has
 * `lastPrice`/`marketValue`/`unrealizedPl` at 0. This enriches each live
 * position with the current mark from **Alpaca** — the desk's single source of
 * truth for prices (see `.agents/infra.md`) — and recomputes market value and
 * unrealized P&L. Free Alpaca accounts use the IEX feed (labelled in the UI).
 *
 * Degrades gracefully: with no Alpaca keys, or if a per-symbol quote fails, the
 * affected position is left untouched rather than guessed — never fabricate a
 * mark. The injectable `getSnapshot` keeps it unit-testable without a network.
 */
export type SnapshotGetter = typeof getStockSnapshot;

function repriced(p: Position, last: number): Position {
  const marketValue = p.qty * last;
  const unrealizedPl = marketValue - p.costBasis;
  return {
    ...p,
    lastPrice: last,
    marketValue,
    unrealizedPl,
    unrealizedPlPct: p.costBasis !== 0 ? unrealizedPl / p.costBasis : 0,
  };
}

export async function enrichLivePositions(
  snapshot: PortfolioSnapshot,
  opts?: { getSnapshot?: SnapshotGetter },
): Promise<PortfolioSnapshot> {
  const getSnapshot = opts?.getSnapshot ?? getStockSnapshot;
  // No price source → return as-is (honest: better a blank mark than a fake one).
  if (!opts?.getSnapshot && !hasAlpacaCredentials()) return snapshot;
  if (snapshot.positions.length === 0) return snapshot;

  const positions = await Promise.all(
    snapshot.positions.map(async (p) => {
      // Only fill positions that lack a live mark; trust any the broker provided.
      if (p.lastPrice && p.marketValue) return p;
      try {
        const snap = await getSnapshot(p.symbol);
        const last = snap.latestTrade?.p ?? snap.dailyBar?.c ?? null;
        return last != null ? repriced(p, last) : p;
      } catch {
        return p; // per-symbol failure → leave that position untouched
      }
    }),
  );

  const totalPl = positions.reduce((s, p) => s + p.unrealizedPl, 0);
  const totalCost = positions.reduce((s, p) => s + p.costBasis, 0);
  return {
    ...snapshot,
    positions,
    totalPl,
    totalPlPct: totalCost !== 0 ? totalPl / totalCost : 0,
  };
}
