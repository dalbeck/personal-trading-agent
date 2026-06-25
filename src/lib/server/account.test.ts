import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getLiveAccount, getPaperAccount } from "./account";

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

  it("returns a live snapshot when a portfolio fetcher is supplied", async () => {
    const dataDir = await mkdtemp(path.join(tmpdir(), "pta-live-"));
    const res = await getLiveAccount({
      dataDir,
      fetcher: async () => ({
        currency: "USD",
        equity: 100,
        cash: 100,
        buying_power: 100,
        last_equity: 100,
        positions: [],
      }),
    });
    expect(res.connected).toBe(true);
    expect(res.source).toBe("robinhood");
    expect(res.snapshot?.account).toBe("live");
    expect(res.snapshot?.equity).toBe(100);
  });
});
