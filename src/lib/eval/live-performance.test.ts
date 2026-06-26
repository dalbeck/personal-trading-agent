import { describe, expect, it } from "vitest";
import { buildLiveBookPerformance } from "./live-performance";
import type { PortfolioSnapshot } from "@/lib/types";

const snapshot = (over: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot =>
  ({
    account: "live",
    asOf: "2026-06-25T16:00:00-04:00",
    currency: "USD",
    equity: 480,
    cash: 30,
    buyingPower: 30,
    totalPl: 30,
    totalPlPct: 0.06,
    dayPl: 0,
    dayPlPct: 0,
    positions: [
      {
        symbol: "NVDA",
        side: "long",
        qty: 2,
        avgCost: 150,
        lastPrice: 170,
        marketValue: 340,
        costBasis: 300,
        unrealizedPl: 40,
        unrealizedPlPct: 0.1333,
        stopPrice: null,
        openedAt: "2026-06-10",
      },
      {
        symbol: "MSFT",
        side: "long",
        qty: 1,
        avgCost: 120,
        lastPrice: 110,
        marketValue: 110,
        costBasis: 120,
        unrealizedPl: -10,
        unrealizedPlPct: -0.0833,
        stopPrice: null,
        openedAt: "2026-06-12",
      },
    ],
    equityCurve: [],
    ...over,
  }) as unknown as PortfolioSnapshot;

describe("buildLiveBookPerformance", () => {
  it("returns null when there is no live snapshot (no live book)", () => {
    expect(buildLiveBookPerformance(null)).toBeNull();
  });

  it("aggregates cost basis, market value, and unrealized P&L vs cost basis", () => {
    const p = buildLiveBookPerformance(snapshot())!;
    expect(p.positions).toBe(2);
    expect(p.costBasisUsd).toBe(420);
    expect(p.marketValueUsd).toBe(450);
    expect(p.unrealizedPlUsd).toBe(30);
    expect(p.unrealizedPlPct).toBeCloseTo(30 / 420, 6);
  });

  it("passes through exits taken and defaults it to zero", () => {
    expect(buildLiveBookPerformance(snapshot())!.exitsTaken).toBe(0);
    expect(
      buildLiveBookPerformance(snapshot(), { exitsTaken: 3 })!.exitsTaken,
    ).toBe(3);
  });

  it("computes excess vs SPY when the snapshot carries a benchmark", () => {
    const p = buildLiveBookPerformance(
      snapshot({
        benchmark: {
          symbol: "SPY",
          portfolioReturnPct: 0.06,
          benchmarkReturnPct: 0.02,
        },
      }),
    )!;
    expect(p.benchmark?.symbol).toBe("SPY");
    expect(p.benchmark?.excessReturnPct).toBeCloseTo(0.04, 6);
  });

  it("has a null benchmark when the snapshot carries none", () => {
    expect(buildLiveBookPerformance(snapshot())!.benchmark).toBeNull();
  });

  it("nulls the P&L percent when cost basis is zero (no div-by-zero)", () => {
    const p = buildLiveBookPerformance(
      snapshot({ positions: [] }),
    )!;
    expect(p.costBasisUsd).toBe(0);
    expect(p.unrealizedPlPct).toBeNull();
  });
});
