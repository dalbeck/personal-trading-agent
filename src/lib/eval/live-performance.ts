import type { PortfolioSnapshot } from "@/lib/types";

/**
 * Live-book performance, distinct from the paper proving-ground scorecard. The
 * live book is human-approved per trade, so it isn't graded by the go/no-go
 * gate — but the desk should still see how it's doing: unrealized P&L **vs cost
 * basis** (always observable from the snapshot) and **vs SPY** where the
 * snapshot carries a benchmark. Pure + account-agnostic — pass the live snapshot.
 */

export interface LiveBookPerformance {
  positions: number;
  costBasisUsd: number;
  marketValueUsd: number;
  unrealizedPlUsd: number;
  /** P&L as a fraction of cost basis; `null` when cost basis is 0. */
  unrealizedPlPct: number | null;
  /** Excess return vs the benchmark, when the snapshot carries one. */
  benchmark: {
    symbol: string;
    portfolioReturnPct: number;
    benchmarkReturnPct: number;
    excessReturnPct: number;
  } | null;
  /** Live exits (sells) taken in the window — counted from the journal. */
  exitsTaken: number;
}

export function buildLiveBookPerformance(
  snapshot: PortfolioSnapshot | null,
  opts?: { exitsTaken?: number },
): LiveBookPerformance | null {
  if (!snapshot) return null;

  const costBasisUsd = snapshot.positions.reduce((s, p) => s + p.costBasis, 0);
  const marketValueUsd = snapshot.positions.reduce(
    (s, p) => s + p.marketValue,
    0,
  );
  const unrealizedPlUsd = snapshot.positions.reduce(
    (s, p) => s + p.unrealizedPl,
    0,
  );

  const benchmark = snapshot.benchmark
    ? {
        symbol: snapshot.benchmark.symbol,
        portfolioReturnPct: snapshot.benchmark.portfolioReturnPct,
        benchmarkReturnPct: snapshot.benchmark.benchmarkReturnPct,
        excessReturnPct:
          snapshot.benchmark.portfolioReturnPct -
          snapshot.benchmark.benchmarkReturnPct,
      }
    : null;

  return {
    positions: snapshot.positions.length,
    costBasisUsd,
    marketValueUsd,
    unrealizedPlUsd,
    unrealizedPlPct: costBasisUsd === 0 ? null : unrealizedPlUsd / costBasisUsd,
    benchmark,
    exitsTaken: opts?.exitsTaken ?? 0,
  };
}
