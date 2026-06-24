import { describe, expect, it } from "vitest";
import type {
  EquityPoint,
  JournalEntry,
  PortfolioSnapshot,
  RunLog,
} from "@/lib/types";
import {
  buildScorecard,
  computeProcessIntegrity,
  computeReliability,
  computeReturnMetrics,
  computeTradeStats,
  decideVerdict,
  matchClosedTrades,
} from "./scorecard";

const curve = (pairs: [string, number][]): EquityPoint[] =>
  pairs.map(([date, equity]) => ({ date, equity }));

function tradeEntry(
  over: Partial<Extract<JournalEntry, { kind: "trade" }>> & {
    id: string;
    timestamp: string;
    symbol: string;
    action: "buy" | "sell";
    qty: number;
    price: number;
  },
): JournalEntry {
  return {
    kind: "trade",
    side: "long",
    stopPrice: 1,
    takeProfit: null,
    riskPct: null,
    reviewDate: "2026-07-01",
    tags: [],
    body: "x",
    ...over,
  };
}

function rejection(rejectedBy: "rules" | "codex-redteam" | "human"): JournalEntry {
  return {
    kind: "rejection",
    id: `r-${rejectedBy}`,
    timestamp: "2026-06-10T10:00:00-04:00",
    symbol: "AMD",
    reviewDate: "2026-07-01",
    tags: [],
    body: "x",
    proposedAction: "buy",
    rejectedBy,
  };
}

const runLog = (status: RunLog["status"]): RunLog => ({
  routine: "midday-scan",
  startedAt: "2026-06-20T12:30:00-04:00",
  finishedAt: "2026-06-20T12:31:00-04:00",
  status,
  summary: "x",
  proposalsConsidered: 0,
  ordersPlaced: 0,
  rejections: 0,
});

describe("computeReturnMetrics", () => {
  it("returns nulls for fewer than two points", () => {
    expect(computeReturnMetrics([]).totalReturnPct).toBeNull();
    expect(computeReturnMetrics(curve([["2026-06-01", 100]])).sharpe).toBeNull();
  });

  it("computes total return and a peak-to-trough drawdown", () => {
    const m = computeReturnMetrics(
      curve([
        ["2026-06-01", 100],
        ["2026-06-02", 110], // peak
        ["2026-06-03", 99], // trough: -10% off the peak
        ["2026-06-04", 104.5],
      ]),
    );
    expect(m.totalReturnPct).toBeCloseTo(0.045);
    expect(m.maxDrawdownPct).toBeCloseTo(-0.1);
    expect(m.returnOverMaxDd).toBeCloseTo(0.045 / 0.1);
    expect(m.volatility).not.toBeNull();
  });

  it("reports zero drawdown for a monotonically rising curve", () => {
    const m = computeReturnMetrics(
      curve([
        ["2026-06-01", 100],
        ["2026-06-02", 101],
        ["2026-06-03", 103],
      ]),
    );
    expect(m.maxDrawdownPct).toBe(0);
    expect(m.returnOverMaxDd).toBeNull(); // undefined ratio when no drawdown
  });
});

describe("matchClosedTrades (FIFO, long-only)", () => {
  it("pairs a buy and a later sell into one closed round-trip", () => {
    const closed = matchClosedTrades([
      tradeEntry({
        id: "b1",
        timestamp: "2026-06-01T10:00:00-04:00",
        symbol: "AMD",
        action: "buy",
        qty: 10,
        price: 100,
      }),
      tradeEntry({
        id: "s1",
        timestamp: "2026-06-11T10:00:00-04:00",
        symbol: "AMD",
        action: "sell",
        qty: 10,
        price: 110,
      }),
    ]);
    expect(closed).toHaveLength(1);
    expect(closed[0].pnl).toBeCloseTo(100); // 10 * (110-100)
    expect(closed[0].pnlPct).toBeCloseTo(0.1);
    expect(closed[0].holdingDays).toBe(10);
  });

  it("splits a sell across FIFO lots and leaves the remainder open", () => {
    const closed = matchClosedTrades([
      tradeEntry({
        id: "b1",
        timestamp: "2026-06-01T10:00:00-04:00",
        symbol: "AMD",
        action: "buy",
        qty: 5,
        price: 100,
      }),
      tradeEntry({
        id: "b2",
        timestamp: "2026-06-02T10:00:00-04:00",
        symbol: "AMD",
        action: "buy",
        qty: 5,
        price: 120,
      }),
      tradeEntry({
        id: "s1",
        timestamp: "2026-06-10T10:00:00-04:00",
        symbol: "AMD",
        action: "sell",
        qty: 8,
        price: 130,
      }),
    ]);
    // 5 from the $100 lot, 3 from the $120 lot; 2 stay open.
    expect(closed).toHaveLength(2);
    expect(closed[0].entryPrice).toBe(100);
    expect(closed[0].qty).toBe(5);
    expect(closed[1].entryPrice).toBe(120);
    expect(closed[1].qty).toBe(3);
  });

  it("ignores a sell with no matching open buy", () => {
    const closed = matchClosedTrades([
      tradeEntry({
        id: "s1",
        timestamp: "2026-06-10T10:00:00-04:00",
        symbol: "TSLA",
        action: "sell",
        qty: 4,
        price: 200,
      }),
    ]);
    expect(closed).toEqual([]);
  });
});

describe("computeTradeStats", () => {
  it("summarizes wins, losses, and profit factor", () => {
    const stats = computeTradeStats(
      [
        tradeEntry({
          id: "b1",
          timestamp: "2026-06-01T10:00:00-04:00",
          symbol: "AMD",
          action: "buy",
          qty: 10,
          price: 100,
        }),
        tradeEntry({
          id: "s1",
          timestamp: "2026-06-05T10:00:00-04:00",
          symbol: "AMD",
          action: "sell",
          qty: 10,
          price: 120,
        }), // +200
        tradeEntry({
          id: "b2",
          timestamp: "2026-06-02T10:00:00-04:00",
          symbol: "NVDA",
          action: "buy",
          qty: 10,
          price: 100,
        }),
        tradeEntry({
          id: "s2",
          timestamp: "2026-06-06T10:00:00-04:00",
          symbol: "NVDA",
          action: "sell",
          qty: 10,
          price: 90,
        }), // -100
      ],
      5,
    );
    expect(stats.tradesClosed).toBe(2);
    expect(stats.winRate).toBeCloseTo(0.5);
    expect(stats.profitFactor).toBeCloseTo(2); // 200 / 100
    expect(stats.largestWinPct).toBeCloseTo(0.2);
    expect(stats.largestLossPct).toBeCloseTo(-0.1);
    expect(stats.proposalsGenerated).toBe(5);
    expect(stats.ordersExecuted).toBe(4);
  });

  it("returns nulls (not NaN) when nothing has closed", () => {
    const stats = computeTradeStats(
      [
        tradeEntry({
          id: "b1",
          timestamp: "2026-06-01T10:00:00-04:00",
          symbol: "AMD",
          action: "buy",
          qty: 10,
          price: 100,
        }),
      ],
      3,
    );
    expect(stats.tradesClosed).toBe(0);
    expect(stats.winRate).toBeNull();
    expect(stats.profitFactor).toBeNull();
    expect(stats.ordersExecuted).toBe(1);
  });
});

describe("computeProcessIntegrity", () => {
  it("counts blocks and passes when stops are present and no live snapshot", () => {
    const integ = computeProcessIntegrity(
      [
        rejection("rules"),
        rejection("codex-redteam"),
        rejection("human"),
        tradeEntry({
          id: "b1",
          timestamp: "2026-06-01T10:00:00-04:00",
          symbol: "AMD",
          action: "buy",
          qty: 1,
          price: 100,
          stopPrice: 90,
        }),
      ],
      [{ account: "paper" } as PortfolioSnapshot],
    );
    expect(integ.ordersBlockedByRules).toBe(1);
    expect(integ.ordersBlockedByRedTeam).toBe(1);
    expect(integ.ordersBlockedByHuman).toBe(1);
    expect(integ.ordersWithoutStop).toBe(0);
    expect(integ.realMoneyPathTouched).toBe(false);
    expect(integ.passes).toBe(true);
  });

  it("fails when a buy has no stop or a live snapshot exists", () => {
    const integ = computeProcessIntegrity(
      [
        tradeEntry({
          id: "b1",
          timestamp: "2026-06-01T10:00:00-04:00",
          symbol: "AMD",
          action: "buy",
          qty: 1,
          price: 100,
          stopPrice: null,
        }),
      ],
      [{ account: "live" } as PortfolioSnapshot],
    );
    expect(integ.ordersWithoutStop).toBe(1);
    expect(integ.realMoneyPathTouched).toBe(true);
    expect(integ.passes).toBe(false);
  });
});

describe("computeReliability", () => {
  it("tallies runs by status", () => {
    const r = computeReliability([
      runLog("ok"),
      runLog("ok"),
      runLog("error"),
      runLog("skipped"),
      runLog("locked"),
    ]);
    expect(r).toEqual({
      totalRuns: 5,
      completed: 2,
      errored: 1,
      skipped: 1,
      locked: 1,
    });
  });
});

describe("decideVerdict", () => {
  const base = {
    window: {
      startDate: "2026-05-01",
      endDate: "2026-06-22",
      points: 40,
      startingEquity: 100000,
      endingEquity: 105000,
    },
    returns: {
      totalReturnPct: 0.05,
      maxDrawdownPct: -0.03,
      returnOverMaxDd: 1.67,
      volatility: 0.01,
      sharpe: 0.5,
    },
    benchmark: {
      symbol: "SPY",
      deskReturnPct: 0.05,
      benchmarkReturnPct: 0.036,
      excessReturnPct: 0.014,
    },
    integrity: {
      ordersBlockedByRules: 1,
      ordersBlockedByRedTeam: 0,
      ordersBlockedByHuman: 0,
      ordersWithoutStop: 0,
      realMoneyPathTouched: false,
      passes: true,
    },
    reliability: {
      totalRuns: 30,
      completed: 30,
      errored: 0,
      skipped: 0,
      locked: 0,
    },
  };

  it("vetoes to no-go on a process-integrity failure regardless of P&L", () => {
    const v = decideVerdict({
      ...base,
      integrity: { ...base.integrity, ordersWithoutStop: 1, passes: false },
    });
    expect(v.kind).toBe("no-go");
    expect(v.reasons.join(" ")).toMatch(/without a protective stop/);
  });

  it("is incomplete when the benchmark return is unknown", () => {
    const v = decideVerdict({
      ...base,
      benchmark: { ...base.benchmark, benchmarkReturnPct: null, excessReturnPct: null },
    });
    expect(v.kind).toBe("incomplete");
  });

  it("is no-go when the desk does not beat the benchmark", () => {
    const v = decideVerdict({
      ...base,
      benchmark: { ...base.benchmark, excessReturnPct: -0.01 },
    });
    expect(v.kind).toBe("no-go");
  });

  it("is a go-candidate on a clean beat with a large sample", () => {
    expect(decideVerdict(base).kind).toBe("go-candidate");
  });

  it("downgrades a clean beat to iterate on a small sample", () => {
    const v = decideVerdict({
      ...base,
      window: { ...base.window, points: 12 },
    });
    expect(v.kind).toBe("iterate");
    expect(v.reasons.join(" ")).toMatch(/sample is small/);
  });
});

describe("buildScorecard", () => {
  it("assembles the full card and computes excess return", () => {
    const card = buildScorecard({
      equityCurve: curve([
        ["2026-05-01", 100000],
        ["2026-06-22", 105000],
      ]),
      journal: [
        tradeEntry({
          id: "b1",
          timestamp: "2026-06-01T10:00:00-04:00",
          symbol: "AMD",
          action: "buy",
          qty: 1,
          price: 100,
          stopPrice: 90,
        }),
      ],
      snapshots: [{ account: "paper" } as PortfolioSnapshot],
      runLogs: [runLog("ok")],
      proposalsGenerated: 4,
      benchmark: { symbol: "SPY", returnPct: 0.036 },
    });
    expect(card.benchmark.deskReturnPct).toBeCloseTo(0.05);
    expect(card.benchmark.excessReturnPct).toBeCloseTo(0.014);
    expect(card.integrity.passes).toBe(true);
    expect(card.trades.ordersExecuted).toBe(1);
    // small sample (2 points) → not a clean go-candidate
    expect(card.verdict.kind).toBe("iterate");
  });
});
