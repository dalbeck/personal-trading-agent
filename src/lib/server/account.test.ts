import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getLiveAccount,
  getPaperAccount,
  refreshLiveAccount,
} from "./account";

// No ALPACA_* keys are set in the test environment, so the resolver must fall
// back to the seed snapshot with a non-blocking notice.
describe("getPaperAccount", () => {
  it("falls back to seed data when no Alpaca credentials are present", async () => {
    const res = await getPaperAccount();
    expect(res.source).toBe("seed");
    expect(res.notice).toMatch(/sample data/i);
    expect(res.snapshot).not.toBeNull();
    expect(res.snapshot?.account).toBe("paper");
  });
});

// No ROBINHOOD_AGENTIC_ACCOUNT_NUMBER is set in the test environment, so the LIVE
// panel must resolve to a clear "disconnected / live trading off" state — never a guess.
describe("getLiveAccount", () => {
  it("reports disconnected with live trading off when no account is configured", async () => {
    const res = await getLiveAccount();
    expect(res.source).toBe("disconnected");
    expect(res.connected).toBe(false);
    expect(res.snapshot).toBeNull();
    expect(res.notice).toMatch(/not connected/i);
  });

  it("renders from the persisted snapshot — no live read on the page path", async () => {
    // getLiveAccount no longer spawns the CLI; with no account configured it is
    // disconnected (covered above). The fresh read lives in refreshLiveAccount.
    const res = await getLiveAccount();
    expect(res.snapshot).toBeNull();
  });
});

describe("refreshLiveAccount", () => {
  it("reads via the fetcher and enriches positions with the Alpaca price", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "pta-live-"));
    const res = await refreshLiveAccount({
      dataDir,
      fetcher: async () => ({
        currency: "USD",
        equity: 100,
        cash: 4,
        buying_power: 4,
        last_equity: 100,
        positions: [
          {
            symbol: "NVDA",
            quantity: "0.1523",
            side: "long",
            average_buy_price: "196.97",
            last_price: null, // Robinhood gives no live mark
            market_value: 0,
            cost_basis: "30",
            unrealized_pl: 0,
            unrealized_pl_pct: 0,
          },
        ],
      }),
      // Injected Alpaca snapshot — last trade $150.
      getSnapshot: async () =>
        ({
          latestTrade: { p: 150, t: "2026-06-25T20:00:00Z" },
          dailyBar: null,
          prevDailyBar: null,
          minuteBar: null,
        }) as never,
    });

    expect(res.connected).toBe(true);
    expect(res.source).toBe("robinhood");
    const pos = res.snapshot?.positions[0];
    expect(pos?.symbol).toBe("NVDA");
    // Market value + P&L are now computed from the Alpaca mark, not 0.
    expect(pos?.lastPrice).toBe(150);
    expect(pos?.marketValue).toBeCloseTo(0.1523 * 150, 4);
    expect(pos?.unrealizedPl).toBeCloseTo(0.1523 * 150 - 30, 4);
  });
});
