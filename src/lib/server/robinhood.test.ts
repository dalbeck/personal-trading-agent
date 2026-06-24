import { describe, expect, it } from "vitest";
import {
  buildLiveSnapshot,
  getRobinhoodLiveSnapshot,
  hasRobinhoodConnection,
  READ_ONLY_TOOLS,
  RobinhoodPortfolioSchema,
} from "./robinhood";

const SAMPLE = {
  currency: "USD",
  equity: 1042.5,
  cash: 612.3,
  buying_power: 612.3,
  last_equity: 1030,
  positions: [
    {
      symbol: "MSFT",
      quantity: "1",
      side: "long",
      average_buy_price: "410",
      last_price: "430.2",
      market_value: "430.2",
      cost_basis: "410",
      unrealized_pl: "20.2",
      unrealized_pl_pct: "0.0493",
    },
  ],
};

describe("robinhood read-only client", () => {
  it("exposes only read tools — no order placement", () => {
    // The allow-list is the contract: this build can call get_portfolio and
    // nothing else. A regression that adds an order tool fails here.
    expect([...READ_ONLY_TOOLS]).toEqual(["get_portfolio"]);
  });

  it("reports not-connected when no token is set (shipped default)", () => {
    // No ROBINHOOD_MCP_TOKEN in the test env → live trading is off.
    expect(hasRobinhoodConnection()).toBe(false);
  });

  it("getRobinhoodLiveSnapshot throws when not connected and no fetcher", async () => {
    await expect(getRobinhoodLiveSnapshot()).rejects.toThrow(/not connected/i);
  });

  it("maps a get_portfolio result into a validated live snapshot", () => {
    const portfolio = RobinhoodPortfolioSchema.parse(SAMPLE);
    const snap = buildLiveSnapshot(portfolio, "2026-06-24T10:00:00-04:00");

    expect(snap.account).toBe("live");
    expect(snap.equity).toBe(1042.5);
    expect(snap.cash).toBe(612.3);
    expect(snap.dayPl).toBeCloseTo(12.5, 5);
    expect(snap.positions).toHaveLength(1);
    expect(snap.positions[0].symbol).toBe("MSFT");
    expect(snap.positions[0].qty).toBe(1);
    expect(snap.positions[0].marketValue).toBeCloseTo(430.2, 5);
  });

  it("fetches and maps through an injected fetcher (network-free)", async () => {
    const snap = await getRobinhoodLiveSnapshot({
      fetcher: async () => SAMPLE,
      asOf: "2026-06-24T10:00:00-04:00",
    });
    expect(snap.account).toBe("live");
    expect(snap.positions[0].symbol).toBe("MSFT");
  });

  it("validates untrusted MCP data and rejects a malformed portfolio", async () => {
    await expect(
      getRobinhoodLiveSnapshot({ fetcher: async () => ({ nonsense: true }) }),
    ).rejects.toThrow();
  });
});
