import { describe, expect, it } from "vitest";
import {
  buildLiveSnapshot,
  FORBIDDEN_TOOLS,
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

  it("never allows an account-enumeration or order tool (Agentic-only privacy)", () => {
    // Privacy contract: only get_portfolio (the single Agentic account) is read.
    // Account-enumeration tools would expose the user's OTHER Robinhood accounts;
    // order tools would breach the closed gate. None may leak into the allow-list.
    for (const forbidden of FORBIDDEN_TOOLS) {
      expect(READ_ONLY_TOOLS as readonly string[]).not.toContain(forbidden);
    }
    expect(READ_ONLY_TOOLS as readonly string[]).not.toContain("get_accounts");
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

  it("renders the real ~$100 Agentic account with a fractional NVDA position", async () => {
    // Mirrors the live account: ~$100 equity, one fractional NVDA position.
    const agentic = {
      currency: "USD",
      equity: 101.42,
      cash: 5.1,
      buying_power: 5.1,
      last_equity: 99.8,
      positions: [
        {
          symbol: "NVDA",
          quantity: "0.65",
          side: "long",
          average_buy_price: "148.0",
          last_price: "148.18",
          market_value: "96.32",
          cost_basis: "96.2",
          unrealized_pl: "0.12",
          unrealized_pl_pct: "0.0012",
        },
      ],
    };
    const snap = await getRobinhoodLiveSnapshot({
      fetcher: async () => agentic,
      asOf: "2026-06-24T10:00:00-04:00",
    });
    expect(snap.account).toBe("live");
    expect(snap.equity).toBeCloseTo(101.42, 5);
    expect(snap.positions).toHaveLength(1);
    expect(snap.positions[0].symbol).toBe("NVDA");
    expect(snap.positions[0].qty).toBeCloseTo(0.65, 5);
    expect(snap.positions[0].marketValue).toBeCloseTo(96.32, 5);
  });

  it("validates untrusted MCP data and rejects a malformed portfolio", async () => {
    await expect(
      getRobinhoodLiveSnapshot({ fetcher: async () => ({ nonsense: true }) }),
    ).rejects.toThrow();
  });
});
