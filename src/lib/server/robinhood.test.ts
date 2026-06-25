import { describe, expect, it } from "vitest";
import {
  buildFundamentalsCliCommand,
  buildLiveSnapshot,
  buildOrdersCliCommand,
  buildPortfolioCliCommand,
  FORBIDDEN_TOOLS,
  getRobinhoodFundamentals,
  getRobinhoodLiveSnapshot,
  getRobinhoodLiveTrades,
  hasRobinhoodConnection,
  mapLiveTrades,
  MARKET_DATA_TOOLS,
  READ_ONLY_TOOLS,
  RobinhoodOrdersSchema,
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
    // The allow-list is the contract: portfolio + positions + read-only order
    // *history* and nothing else. A regression that adds an order-placement tool
    // fails here.
    expect([...READ_ONLY_TOOLS]).toEqual([
      "get_portfolio",
      "get_equity_positions",
      "get_equity_orders",
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

  describe("buildOrdersCliCommand — read-only order history, safe by construction", () => {
    const { cmd, args } = buildOrdersCliCommand("1AB23456");
    const joined = args.join(" ");

    it("spawns the host claude CLI in print mode and allow-lists get_equity_orders", () => {
      expect(cmd).toBe("claude");
      expect(args[0]).toBe("-p");
      expect(joined).toContain("mcp__robinhood-trading__get_equity_orders");
    });

    it("disallows every order-placement + enumeration tool, allow-lists none", () => {
      const allowIdx = args.indexOf("--allowedTools");
      const disallowIdx = args.indexOf("--disallowedTools");
      const allowed = args.slice(allowIdx + 1, disallowIdx);
      for (const forbidden of FORBIDDEN_TOOLS) {
        const id = `mcp__robinhood-trading__${forbidden}`;
        expect(allowed).not.toContain(id);
        expect(joined).toContain(id);
      }
      expect(joined).toMatch(/Do NOT call get_accounts/);
      expect(joined).toMatch(/READ-ONLY/);
    });

    it("references only the one supplied account number", () => {
      expect(joined).toContain("1AB23456");
    });
  });

  describe("mapLiveTrades — keep only filled, usable fills", () => {
    it("filters out non-filled / zero-qty / no-price orders and maps the rest", () => {
      const orders = RobinhoodOrdersSchema.parse({
        orders: [
          {
            id: "a",
            symbol: "NVDA",
            side: "buy",
            quantity: "2",
            average_price: "196.97",
            state: "filled",
            filled_at: "2026-06-24T14:31:00-04:00",
          },
          {
            id: "b",
            symbol: "AAPL",
            side: "sell",
            quantity: "1",
            average_price: "210",
            state: "cancelled",
          },
          {
            id: "c",
            symbol: "TSLA",
            side: "buy",
            quantity: "0",
            average_price: "250",
            state: "filled",
          },
        ],
      });
      const trades = mapLiveTrades(orders);
      expect(trades).toHaveLength(1);
      expect(trades[0]).toMatchObject({
        orderId: "a",
        symbol: "NVDA",
        action: "buy",
        qty: 2,
        price: 196.97,
      });
    });
  });

  it("getRobinhoodLiveTrades throws when not connected and no fetcher", async () => {
    await expect(getRobinhoodLiveTrades()).rejects.toThrow(/not connected/i);
  });

  describe("buildFundamentalsCliCommand — read-only market data, no account", () => {
    const { cmd, args } = buildFundamentalsCliCommand("AAPL");
    const joined = args.join(" ");

    it("spawns the host claude CLI and allow-lists ONLY get_equity_fundamentals", () => {
      expect(cmd).toBe("claude");
      expect(args[0]).toBe("-p");
      const allowIdx = args.indexOf("--allowedTools");
      const disallowIdx = args.indexOf("--disallowedTools");
      const allowed = args.slice(allowIdx + 1, disallowIdx);
      expect(allowed).toEqual(["mcp__robinhood-trading__get_equity_fundamentals"]);
    });

    it("disallows every order + enumeration tool, allow-lists none", () => {
      const allowIdx = args.indexOf("--allowedTools");
      const disallowIdx = args.indexOf("--disallowedTools");
      const allowed = args.slice(allowIdx + 1, disallowIdx);
      for (const forbidden of FORBIDDEN_TOOLS) {
        const id = `mcp__robinhood-trading__${forbidden}`;
        expect(allowed).not.toContain(id);
        expect(joined).toContain(id);
      }
      expect(joined).toMatch(/Do NOT call get_accounts/);
    });

    it("references no brokerage account (market data is symbol-scoped)", () => {
      expect(joined).toContain('["AAPL"]');
      expect(joined).toMatch(/READ-ONLY market data/);
      expect(joined).toMatch(/do NOT read any brokerage account/i);
    });
  });

  it("MARKET_DATA_TOOLS never includes an order or enumeration tool", () => {
    for (const forbidden of FORBIDDEN_TOOLS) {
      expect(MARKET_DATA_TOOLS as readonly string[]).not.toContain(forbidden);
    }
    expect(MARKET_DATA_TOOLS as readonly string[]).not.toContain("get_accounts");
  });

  describe("getRobinhoodFundamentals — maps the fundamentals + profile", () => {
    it("returns null when not connected and no fetcher (default-off)", async () => {
      expect(await getRobinhoodFundamentals("AAPL")).toBeNull();
    });

    it("maps a real-shaped result through an injected fetcher (network-free)", async () => {
      const res = await getRobinhoodFundamentals("AAPL", {
        fetcher: async () => ({
          symbol: "AAPL",
          market_cap: "4047627128999.99",
          pe_ratio: "35.45",
          dividend_yield: "0.358264", // percent value → fraction
          ceo: "Timothy Donald Cook",
          num_employees: 166000,
          sector: "Electronic Technology",
          industry: "Telecommunications Equipment",
          description: "Apple, Inc. designs and sells smartphones and services.",
        }),
      });
      expect(res).not.toBeNull();
      expect(res!.fundamentals.marketCap).toBeCloseTo(4.04762712e12, -6);
      expect(res!.fundamentals.peRatio).toBeCloseTo(35.45);
      expect(res!.fundamentals.eps).toBeNull(); // Robinhood does not supply EPS
      expect(res!.fundamentals.dividendYield).toBeCloseTo(0.00358264);
      expect(res!.profile.ceo).toBe("Timothy Donald Cook");
      expect(res!.profile.employees).toBe(166000);
      expect(res!.profile.sector).toBe("Electronic Technology");
      expect(res!.profile.exchange).toBeNull();
      expect(res!.profile.ipoDate).toBeNull();
    });

    it("returns null for a symbol with no usable data", async () => {
      const res = await getRobinhoodFundamentals("ZZZZ", {
        fetcher: async () => ({
          symbol: "ZZZZ",
          market_cap: null,
          pe_ratio: null,
          dividend_yield: null,
          ceo: null,
          num_employees: null,
          sector: null,
          industry: null,
          description: null,
        }),
      });
      expect(res).toBeNull();
    });

    it("survives a malformed result without throwing", async () => {
      const res = await getRobinhoodFundamentals("AAPL", {
        fetcher: async () => {
          throw new Error("CLI blew up");
        },
      });
      expect(res).toBeNull();
    });
  });

  it("getRobinhoodLiveTrades maps through an injected fetcher (network-free)", async () => {
    const trades = await getRobinhoodLiveTrades({
      fetcher: async () => ({
        orders: [
          {
            id: "x",
            symbol: "MSFT",
            side: "buy",
            quantity: "1",
            average_price: "410",
            state: "filled",
            filled_at: "2026-06-24T10:00:00-04:00",
          },
        ],
      }),
    });
    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe("MSFT");
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
