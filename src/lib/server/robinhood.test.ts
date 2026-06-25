import { describe, expect, it } from "vitest";
import {
  buildLiveSnapshot,
  buildPortfolioCliCommand,
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
  it("exposes only account-scoped read tools — no order placement", () => {
    // The allow-list is the contract: portfolio + positions reads and nothing
    // else. A regression that adds an order tool fails here.
    expect([...READ_ONLY_TOOLS]).toEqual([
      "get_portfolio",
      "get_equity_positions",
    ]);
  });

  it("never allows an account-enumeration or order tool (Agentic-only privacy)", () => {
    // Privacy contract: only the ONE configured account is read. Account-
    // enumeration (get_accounts) would expose the user's OTHER accounts; order
    // tools would breach the closed gate. None may leak into the allow-list.
    for (const forbidden of FORBIDDEN_TOOLS) {
      expect(READ_ONLY_TOOLS as readonly string[]).not.toContain(forbidden);
    }
    expect(READ_ONLY_TOOLS as readonly string[]).not.toContain("get_accounts");
  });

  it("reports not-connected when no account number is set (shipped default)", () => {
    // No ROBINHOOD_AGENTIC_ACCOUNT_NUMBER in the test env → live trading is off.
    expect(hasRobinhoodConnection()).toBe(false);
  });

  describe("buildPortfolioCliCommand — safe by construction", () => {
    const { cmd, args } = buildPortfolioCliCommand("1AB23456");
    const joined = args.join(" ");

    it("spawns the host claude CLI in print mode", () => {
      expect(cmd).toBe("claude");
      expect(args[0]).toBe("-p");
    });

    it("allow-lists ONLY the read-only tools, namespaced to the MCP", () => {
      expect(joined).toContain("--allowedTools");
      expect(joined).toContain("mcp__robinhood-trading__get_portfolio");
      expect(joined).toContain("mcp__robinhood-trading__get_equity_positions");
    });

    it("disallows every order + enumeration tool, and allow-lists none of them", () => {
      const allowIdx = args.indexOf("--allowedTools");
      const disallowIdx = args.indexOf("--disallowedTools");
      const allowed = args.slice(allowIdx + 1, disallowIdx);
      for (const forbidden of FORBIDDEN_TOOLS) {
        const id = `mcp__robinhood-trading__${forbidden}`;
        expect(allowed).not.toContain(id); // never allowed
        expect(joined).toContain(id); // explicitly disallowed
      }
    });

    it("references only the one supplied account number", () => {
      expect(joined).toContain("1AB23456");
      // get_accounts only ever appears as a disallowed tool / an instruction not
      // to call it — never as an allowed tool (asserted above).
      expect(joined).toMatch(/Do NOT call get_accounts/);
    });
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
