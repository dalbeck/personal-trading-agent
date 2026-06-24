import { describe, expect, it } from "vitest";
import { buildSnapshot, mapPosition } from "./alpaca";

const apiPosition = {
  symbol: "AAPL",
  side: "long" as const,
  qty: 10,
  avg_entry_price: 190,
  current_price: 200,
  market_value: 2000,
  cost_basis: 1900,
  unrealized_pl: 100,
  unrealized_plpc: 0.0526,
};

describe("alpaca mapping", () => {
  it("maps an Alpaca position into the internal contract", () => {
    const p = mapPosition(apiPosition);
    expect(p.symbol).toBe("AAPL");
    expect(p.qty).toBe(10);
    expect(p.lastPrice).toBe(200);
    expect(p.unrealizedPl).toBe(100);
    expect(p.stopPrice).toBeNull();
  });

  it("uses |qty| and derives last price when current_price is missing", () => {
    // A short: Alpaca reports negative qty and negative market_value.
    const p = mapPosition({
      ...apiPosition,
      side: "short",
      qty: -5,
      current_price: null,
      market_value: -1000,
      cost_basis: -950,
      unrealized_pl: -50,
      unrealized_plpc: -0.0526,
    });
    expect(p.qty).toBe(5); // absolute value
    expect(p.lastPrice).toBe(200); // -1000 / -5
  });

  it("builds a snapshot that satisfies the PortfolioSnapshot contract", () => {
    const snap = buildSnapshot({
      account: {
        currency: "USD",
        cash: 5000,
        equity: 7000,
        last_equity: 6800,
        buying_power: 5000,
      },
      positions: [apiPosition],
      history: {
        timestamp: [1718000000, 1718086400],
        equity: [6900, 7000],
      },
    });
    expect(snap.account).toBe("paper");
    expect(snap.equity).toBe(7000);
    expect(snap.dayPl).toBeCloseTo(200);
    expect(snap.totalPl).toBeCloseTo(100);
    expect(snap.positions).toHaveLength(1);
    expect(snap.equityCurve).toHaveLength(2);
  });
});
