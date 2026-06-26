import "server-only";

import { getLatestPrice, hasAlpacaCredentials } from "@/lib/server/alpaca";
import type { PortfolioSnapshot, Position } from "@/lib/types";

/**
 * Robinhood's position data carries quantity + average cost but **no current
 * price** (that needs a live quote), so a freshly-read live snapshot has
 * `lastPrice`/`marketValue`/`unrealizedPl` at 0. This enriches each live
 * position with the current mark from **Alpaca** — the desk's single source of
 * truth for prices (see `.agents/infra.md`) — and recomputes market value and
 * unrealized P&L. Free Alpaca accounts use the IEX feed (labelled in the UI).
 *
 * Resolving the mark is two-tier because the IEX **snapshot** is empty after
 * hours: try the snapshot's latest trade / daily close first, then fall back to
 * the most recent daily **bar** close (which is available when markets are
 * closed). If neither yields a price the position is left untouched — never
 * fabricate a mark. The injectable `getMark` keeps it unit-testable offline.
 */
export type MarkGetter = (symbol: string) => Promise<number | null>;

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
  opts?: { getMark?: MarkGetter },
): Promise<PortfolioSnapshot> {
  const getMark = opts?.getMark ?? getLatestPrice;
  // No price source → return as-is (honest: better a blank mark than a fake one).
  if (!opts?.getMark && !hasAlpacaCredentials()) return snapshot;
  if (snapshot.positions.length === 0) return snapshot;

  const positions = await Promise.all(
    snapshot.positions.map(async (p) => {
      // Only fill positions that lack a live mark; trust any the broker provided.
      if (p.lastPrice && p.marketValue) return p;
      try {
        const last = await getMark(p.symbol);
        return last != null && last > 0 ? repriced(p, last) : p;
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
