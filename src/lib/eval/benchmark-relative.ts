import type { ReturnMetrics } from "./scorecard";

/**
 * Benchmark-relative, net-of-cost performance (cost-aware-scorecard M2). Turns
 * the gross paper return + the M1 cost drag + the SPY return over the same window
 * into the one number that answers "is this worth doing": the **annualized net
 * excess return vs SPY**.
 *
 * **Pure** (no IO): metrics in, metrics out, so the math is unit-tested in
 * isolation. `src/lib/server/eval.ts` reads the paper window, the cost model, and
 * the SPY closes (via `ALPACA_DATA_URL`) and feeds this. Ratios are fractions
 * (0.0423 === +4.23%). Annualization compounds a cumulative return to a 365-day
 * year over the window's **calendar** span.
 */

const DAYS_PER_YEAR = 365;

/** Calendar days between two ISO dates (UTC midnight diff, rounded, ≥ 0). */
function daysBetween(start: string, end: string): number {
  const ms =
    new Date(`${end}T00:00:00Z`).getTime() -
    new Date(`${start}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Compound a cumulative return to an annualized rate over `windowDays` calendar
 * days: `(1 + r)^(365/days) − 1`. `null` for a null return or a non-positive
 * window (can't annualize a zero-length window).
 */
export function annualizeReturn(
  cumulativeReturn: number | null,
  windowDays: number,
): number | null {
  if (cumulativeReturn === null || windowDays <= 0) return null;
  return (1 + cumulativeReturn) ** (DAYS_PER_YEAR / windowDays) - 1;
}

export interface RailLimits {
  perPositionRiskPct: number;
  perPositionSizePct: number;
  maxConcurrentPositions: number;
  maxOrdersPerDay: number;
}

export interface RailAdherence {
  /** Trades whose risk-to-stop exceeded the ≤2%/position rail. */
  perPositionRisk: number;
  /** Current positions exceeding the ≤20%-of-equity size rail. */
  positionSize: number;
  /** 1 when the current book holds more than the ≤5-positions rail allows. */
  concurrentPositions: number;
  /** Calendar days (ET) on which more than the ≤6-orders/day rail were placed. */
  ordersPerDay: number;
  /** Sum of the above — expected 0 (the rails are enforced in code). */
  totalBreaches: number;
}

export function computeRailAdherence(input: {
  trades: { timestamp: string; riskPct?: number | null }[];
  latestSnapshot: {
    equity: number;
    positions: { marketValue: number }[];
  } | null;
  limits: RailLimits;
}): RailAdherence {
  const { trades, latestSnapshot, limits } = input;

  const perPositionRisk = trades.filter(
    (t) => t.riskPct != null && t.riskPct > limits.perPositionRiskPct,
  ).length;

  let positionSize = 0;
  let concurrentPositions = 0;
  if (latestSnapshot && latestSnapshot.equity > 0) {
    positionSize = latestSnapshot.positions.filter(
      (p) => p.marketValue / latestSnapshot.equity > limits.perPositionSizePct,
    ).length;
    concurrentPositions =
      latestSnapshot.positions.length > limits.maxConcurrentPositions ? 1 : 0;
  }

  // Group placed trades by their local (ET) calendar day; flag days over the cap.
  const perDay = new Map<string, number>();
  for (const t of trades) {
    const day = t.timestamp.slice(0, 10);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
  }
  const ordersPerDay = [...perDay.values()].filter(
    (n) => n > limits.maxOrdersPerDay,
  ).length;

  return {
    perPositionRisk,
    positionSize,
    concurrentPositions,
    ordersPerDay,
    totalBreaches:
      perPositionRisk + positionSize + concurrentPositions + ordersPerDay,
  };
}

export interface NetPerformanceBenchmark {
  symbol: string;
  returnPct: number | null;
  maxDrawdownPct: number | null;
}

export interface NetPerformance {
  windowDays: number;
  /** Strategy gross cumulative + annualized return. */
  grossReturnPct: number | null;
  grossAnnualizedPct: number | null;
  /** Cost drag over the window (fraction of capital, ≥ 0). */
  costDragPct: number;
  /** Strategy net-of-cost cumulative + annualized return (gross − drag). */
  netReturnPct: number | null;
  netAnnualizedPct: number | null;
  benchmarkSymbol: string;
  benchmarkReturnPct: number | null;
  benchmarkAnnualizedPct: number | null;
  /** Net cumulative − benchmark cumulative. */
  netExcessReturnPct: number | null;
  /** **The headline:** net annualized − benchmark annualized. */
  netExcessAnnualizedPct: number | null;
  strategyMaxDrawdownPct: number | null;
  benchmarkMaxDrawdownPct: number | null;
  strategySharpe: number | null;
  strategyVolatility: number | null;
  rails: RailAdherence;
}

export function buildNetPerformance(input: {
  windowStart: string | null;
  windowEnd: string | null;
  strategyReturns: ReturnMetrics;
  costDragPct: number;
  benchmark: NetPerformanceBenchmark;
  rails: RailAdherence;
}): NetPerformance {
  const windowDays =
    input.windowStart && input.windowEnd
      ? daysBetween(input.windowStart, input.windowEnd)
      : 0;

  const grossReturnPct = input.strategyReturns.totalReturnPct;
  const netReturnPct =
    grossReturnPct === null ? null : grossReturnPct - input.costDragPct;

  const grossAnnualizedPct = annualizeReturn(grossReturnPct, windowDays);
  const netAnnualizedPct = annualizeReturn(netReturnPct, windowDays);
  const benchmarkAnnualizedPct = annualizeReturn(
    input.benchmark.returnPct,
    windowDays,
  );

  const netExcessReturnPct =
    netReturnPct !== null && input.benchmark.returnPct !== null
      ? netReturnPct - input.benchmark.returnPct
      : null;
  const netExcessAnnualizedPct =
    netAnnualizedPct !== null && benchmarkAnnualizedPct !== null
      ? netAnnualizedPct - benchmarkAnnualizedPct
      : null;

  return {
    windowDays,
    grossReturnPct,
    grossAnnualizedPct,
    costDragPct: input.costDragPct,
    netReturnPct,
    netAnnualizedPct,
    benchmarkSymbol: input.benchmark.symbol,
    benchmarkReturnPct: input.benchmark.returnPct,
    benchmarkAnnualizedPct,
    netExcessReturnPct,
    netExcessAnnualizedPct,
    strategyMaxDrawdownPct: input.strategyReturns.maxDrawdownPct,
    benchmarkMaxDrawdownPct: input.benchmark.maxDrawdownPct,
    strategySharpe: input.strategyReturns.sharpe,
    strategyVolatility: input.strategyReturns.volatility,
    rails: input.rails,
  };
}
