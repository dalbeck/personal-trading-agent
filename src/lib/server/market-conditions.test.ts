import { describe, expect, it } from "vitest";
import { getMarketConditions, NEUTRAL_MARKET } from "./market-conditions";

describe("getMarketConditions", () => {
  it("returns the neutral reading with no source wired (no Alpaca creds in test env)", async () => {
    expect(await getMarketConditions()).toEqual(NEUTRAL_MARKET);
  });

  it("uses the injected SPY change and VIX when provided", async () => {
    const conds = await getMarketConditions({
      spyChange: async () => -0.025,
      vix: async () => 34,
    });
    expect(conds.spyIntradayChangePct).toBeCloseTo(-0.025);
    expect(conds.vix).toBe(34);
  });

  it("computes SPY intraday change from an injected Alpaca snapshot fetch", async () => {
    // last 392 vs prev close 400 → −2%.
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          latestTrade: { p: 392, t: "2026-06-24T14:00:00Z" },
          dailyBar: { o: 399, h: 401, l: 390, c: 392, v: 1 },
          prevDailyBar: { o: 395, h: 402, l: 394, c: 400, v: 1 },
          minuteBar: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )) as unknown as typeof fetch;

    const conds = await getMarketConditions({ fetchImpl });
    expect(conds.spyIntradayChangePct).toBeCloseTo(-0.02);
    expect(conds.vix).toBe(NEUTRAL_MARKET.vix); // no VIX source → neutral
  });

  it("fails soft to neutral when the SPY fetch throws", async () => {
    const conds = await getMarketConditions({
      spyChange: async () => {
        throw new Error("network down");
      },
    });
    expect(conds.spyIntradayChangePct).toBe(0);
  });
});
