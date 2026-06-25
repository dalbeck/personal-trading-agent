import { describe, expect, it } from "vitest";
import { enrichLivePositions } from "./live-price";
import type { PortfolioSnapshot } from "@/lib/types";

function snapshot(positions: PortfolioSnapshot["positions"]): PortfolioSnapshot {
  return {
    account: "live",
    asOf: "2026-06-25T20:00:00Z",
    currency: "USD",
    equity: 100,
    cash: 4,
    buyingPower: 4,
    totalPl: 0,
    totalPlPct: 0,
    dayPl: 0,
    dayPlPct: 0,
    positions,
    equityCurve: [],
  };
}

const nvda = {
  symbol: "NVDA",
  side: "long" as const,
  qty: 0.1523,
  avgCost: 196.97,
  lastPrice: 0,
  marketValue: 0,
  costBasis: 30,
  unrealizedPl: 0,
  unrealizedPlPct: 0,
  stopPrice: null,
  openedAt: "2026-06-25",
};

const okSnap = async () =>
  ({
    latestTrade: { p: 150, t: "2026-06-25T20:00:00Z" },
    dailyBar: null,
    prevDailyBar: null,
    minuteBar: null,
  }) as never;

describe("enrichLivePositions", () => {
  it("fills last price + market value + P&L from the Alpaca mark", async () => {
    const out = await enrichLivePositions(snapshot([nvda]), {
      getSnapshot: okSnap,
    });
    const p = out.positions[0];
    expect(p.lastPrice).toBe(150);
    expect(p.marketValue).toBeCloseTo(0.1523 * 150, 4);
    expect(p.unrealizedPl).toBeCloseTo(0.1523 * 150 - 30, 4);
    expect(out.totalPl).toBeCloseTo(0.1523 * 150 - 30, 4);
  });

  it("falls back to the daily close when there is no latest trade", async () => {
    const out = await enrichLivePositions(snapshot([nvda]), {
      getSnapshot: async () =>
        ({
          latestTrade: null,
          dailyBar: { c: 140 },
          prevDailyBar: null,
          minuteBar: null,
        }) as never,
    });
    expect(out.positions[0].lastPrice).toBe(140);
  });

  it("leaves a position untouched when the quote fails — never fabricates a mark", async () => {
    const out = await enrichLivePositions(snapshot([nvda]), {
      getSnapshot: async () => {
        throw new Error("quote unavailable");
      },
    });
    expect(out.positions[0].lastPrice).toBe(0);
    expect(out.positions[0].marketValue).toBe(0);
  });

  it("does not re-price a position that already has a live mark", async () => {
    const priced = { ...nvda, lastPrice: 151, marketValue: 23 };
    const out = await enrichLivePositions(snapshot([priced]), {
      getSnapshot: okSnap,
    });
    expect(out.positions[0].lastPrice).toBe(151);
  });
});
