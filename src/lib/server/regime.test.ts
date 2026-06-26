import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getRegimeContext } from "./regime";

/** Rising daily series long enough for SMA200 + the rotation lookback. */
const rising = (n: number) => Array.from({ length: n }, (_, i) => 100 + i);

describe("getRegimeContext", () => {
  it("computes trend, VIX band, and sector rotation from injected data", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pta-regime-"));
    // SPY rises modestly; XLK rips, XLU lags.
    const barsGetter = async (symbol: string) => {
      if (symbol === "SPY") return rising(260);
      if (symbol === "XLK") return rising(260).map((v) => v * 1.5);
      if (symbol === "XLU") return rising(260).map((v) => v * 0.9);
      return rising(260); // other sectors flat-ish
    };
    const ctx = await getRegimeContext({
      dataDir: dir,
      noCache: true,
      hasCredentials: () => true,
      barsGetter,
      vixGetter: async () => 13.5,
    });

    expect(ctx.degraded).toBe(false);
    expect(ctx.trend).toBe("uptrend");
    expect(ctx.vix).toBe(13.5);
    expect(ctx.vixBand).toBe("calm");
    expect(ctx.leaders[0].symbol).toBe("XLK");
    expect(ctx.laggards[0].symbol).toBe("XLU");
    expect(ctx.summary).toMatch(/risk-on/i);
    expect(ctx.summary).toMatch(/advisory/i);
  });

  it("degrades fail-soft when Alpaca credentials are absent", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pta-regime-"));
    const ctx = await getRegimeContext({
      dataDir: dir,
      noCache: true,
      hasCredentials: () => false,
      vixGetter: async () => 18,
    });
    expect(ctx.degraded).toBe(true);
    expect(ctx.leaders).toEqual([]);
    expect(ctx.trend).toBe("range");
    expect(ctx.vix).toBe(18);
    expect(ctx.summary).toMatch(/unavailable/i);
    expect(ctx.summary).toMatch(/advisory/i);
  });
});
