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

describe("enrichLivePositions", () => {
  it("fills last price + market value + P&L from the resolved mark", async () => {
    const out = await enrichLivePositions(snapshot([nvda]), {
      getMark: async () => 150,
    });
    const p = out.positions[0];
    expect(p.lastPrice).toBe(150);
    expect(p.marketValue).toBeCloseTo(0.1523 * 150, 4);
    expect(p.unrealizedPl).toBeCloseTo(0.1523 * 150 - 30, 4);
    expect(out.totalPl).toBeCloseTo(0.1523 * 150 - 30, 4);
  });

  it("leaves a position untouched when no mark is available — never fabricates", async () => {
    const out = await enrichLivePositions(snapshot([nvda]), {
      getMark: async () => null,
    });
    expect(out.positions[0].lastPrice).toBe(0);
    expect(out.positions[0].marketValue).toBe(0);
  });

  it("leaves a position untouched when the mark lookup throws", async () => {
    const out = await enrichLivePositions(snapshot([nvda]), {
      getMark: async () => {
        throw new Error("quote unavailable");
      },
    });
    expect(out.positions[0].lastPrice).toBe(0);
  });

  it("does not re-price a position that already has a live mark", async () => {
    const priced = { ...nvda, lastPrice: 151, marketValue: 23 };
    const out = await enrichLivePositions(snapshot([priced]), {
      getMark: async () => 150,
    });
    expect(out.positions[0].lastPrice).toBe(151);
  });
});
