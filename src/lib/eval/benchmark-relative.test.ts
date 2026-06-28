import { describe, expect, it } from "vitest";
import { computeReturnMetrics } from "./scorecard";
import {
  annualizeReturn,
  buildNetPerformance,
  computeRailAdherence,
  type RailLimits,
} from "./benchmark-relative";
import type { EquityPoint } from "@/lib/types";

const curve = (pairs: [string, number][]): EquityPoint[] =>
  pairs.map(([date, equity]) => ({ date, equity }));

const LIMITS: RailLimits = {
  perPositionRiskPct: 0.02,
  perPositionSizePct: 0.2,
  maxConcurrentPositions: 5,
  maxOrdersPerDay: 6,
};

describe("annualizeReturn", () => {
  it("compounds a cumulative return to a 365-day year", () => {
    // 10% over 90 days → (1.1)^(365/90) − 1
    expect(annualizeReturn(0.1, 90)).toBeCloseTo(0.4719, 3);
  });

  it("is null for a non-positive window or a null return", () => {
    expect(annualizeReturn(0.1, 0)).toBeNull();
    expect(annualizeReturn(null, 90)).toBeNull();
  });
});

describe("buildNetPerformance", () => {
  const strategy = computeReturnMetrics(
    curve([
      ["2026-01-01", 1_000],
      ["2026-02-15", 1_050],
      ["2026-04-01", 1_100], // +10% gross over 90 days, monotonic (no drawdown)
    ]),
  );

  it("reports gross, net-of-cost, SPY, and the annualized net excess headline", () => {
    const perf = buildNetPerformance({
      windowStart: "2026-01-01",
      windowEnd: "2026-04-01",
      strategyReturns: strategy,
      costDragPct: 0.0577, // ~$57.70 on $1,000 from the M1 cost model
      benchmark: {
        symbol: "SPY",
        returnPct: 0.06,
        maxDrawdownPct: -0.04,
      },
      rails: {
        perPositionRisk: 0,
        positionSize: 0,
        concurrentPositions: 0,
        ordersPerDay: 0,
        totalBreaches: 0,
      },
    });

    expect(perf.windowDays).toBe(90);
    expect(perf.grossReturnPct).toBeCloseTo(0.1, 6);
    expect(perf.grossAnnualizedPct).toBeCloseTo(0.4719, 3);
    // net = gross − drag
    expect(perf.netReturnPct).toBeCloseTo(0.0423, 6);
    expect(perf.netAnnualizedPct).toBeCloseTo(0.183, 3);
    expect(perf.benchmarkReturnPct).toBe(0.06);
    expect(perf.benchmarkAnnualizedPct).toBeCloseTo(0.2666, 3);
    // headline: net annualized − SPY annualized (net trails SPY here → negative)
    expect(perf.netExcessAnnualizedPct).toBeCloseTo(-0.0836, 3);
    expect(perf.strategyMaxDrawdownPct).toBe(0);
    expect(perf.benchmarkMaxDrawdownPct).toBe(-0.04);
  });

  it("nulls the net/excess figures when the benchmark series is unavailable", () => {
    const perf = buildNetPerformance({
      windowStart: "2026-01-01",
      windowEnd: "2026-04-01",
      strategyReturns: strategy,
      costDragPct: 0.0577,
      benchmark: { symbol: "SPY", returnPct: null, maxDrawdownPct: null },
      rails: {
        perPositionRisk: 0,
        positionSize: 0,
        concurrentPositions: 0,
        ordersPerDay: 0,
        totalBreaches: 0,
      },
    });
    expect(perf.netReturnPct).toBeCloseTo(0.0423, 6); // net is still computable
    expect(perf.benchmarkAnnualizedPct).toBeNull();
    expect(perf.netExcessReturnPct).toBeNull();
    expect(perf.netExcessAnnualizedPct).toBeNull();
  });
});

describe("computeRailAdherence", () => {
  it("counts a per-position-risk breach when a trade risks more than the cap", () => {
    const rails = computeRailAdherence({
      trades: [
        { timestamp: "2026-02-01T10:00:00-05:00", riskPct: 0.015 }, // ok
        { timestamp: "2026-02-02T10:00:00-05:00", riskPct: 0.025 }, // breach
        { timestamp: "2026-02-03T10:00:00-05:00", riskPct: null }, // unknown — ignored
      ],
      latestSnapshot: null,
      limits: LIMITS,
    });
    expect(rails.perPositionRisk).toBe(1);
    expect(rails.totalBreaches).toBe(1);
  });

  it("counts position-size and concurrency breaches from the latest snapshot", () => {
    const rails = computeRailAdherence({
      trades: [],
      latestSnapshot: {
        equity: 1_000,
        positions: [
          { marketValue: 150 }, // 15% ok
          { marketValue: 250 }, // 25% > 20% breach
        ],
      },
      limits: { ...LIMITS, maxConcurrentPositions: 1 }, // 2 positions > 1 → breach
    });
    expect(rails.positionSize).toBe(1);
    expect(rails.concurrentPositions).toBe(1);
    expect(rails.totalBreaches).toBe(2);
  });

  it("counts a day that exceeds the daily order cap", () => {
    const sameDay = Array.from({ length: 7 }, (_, i) => ({
      timestamp: `2026-02-01T1${i}:00:00-05:00`,
      riskPct: 0.01,
    }));
    const rails = computeRailAdherence({
      trades: [
        ...sameDay, // 7 on Feb 1 → breach
        { timestamp: "2026-02-02T10:00:00-05:00", riskPct: 0.01 }, // 1 on Feb 2 → ok
      ],
      latestSnapshot: null,
      limits: LIMITS,
    });
    expect(rails.ordersPerDay).toBe(1);
    expect(rails.totalBreaches).toBe(1);
  });

  it("is all-zero (clean adherence) for a compliant book", () => {
    const rails = computeRailAdherence({
      trades: [{ timestamp: "2026-02-01T10:00:00-05:00", riskPct: 0.018 }],
      latestSnapshot: {
        equity: 1_000,
        positions: [{ marketValue: 180 }],
      },
      limits: LIMITS,
    });
    expect(rails.totalBreaches).toBe(0);
  });
});
