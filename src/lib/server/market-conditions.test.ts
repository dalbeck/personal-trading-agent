import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getMarketConditions, NEUTRAL_MARKET } from "./market-conditions";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-mktcond-"));
}
async function seedVixCache(
  dataDir: string,
  vix: number,
  fetchedAt: string,
): Promise<void> {
  const file = path.join(dataDir, "control", "market-conditions.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ vix, fetchedAt }), "utf8");
}

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

describe("VIX TTL cache", () => {
  const NOW = new Date("2026-06-24T14:00:00Z");

  it("serves a cached VIX within the TTL window and does NOT refetch", async () => {
    const dataDir = await tmp();
    // Cached 5 min ago, TTL 10 min → served from cache; the fetcher must not run.
    await seedVixCache(
      dataDir,
      28,
      new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    );
    let fetched = false;
    const conds = await getMarketConditions({
      spyChange: async () => 0,
      vixFetcher: async () => {
        fetched = true;
        return { vix: 99 };
      },
      dataDir,
      now: NOW,
      vixTtlMs: 10 * 60_000,
    });
    expect(conds.vix).toBe(28);
    expect(fetched).toBe(false);
  });

  it("refetches past the TTL and writes the freshly-fetched value to the cache", async () => {
    const dataDir = await tmp();
    // Cached 20 min ago, TTL 10 min → stale, refetch through the cache path.
    await seedVixCache(
      dataDir,
      28,
      new Date(NOW.getTime() - 20 * 60_000).toISOString(),
    );
    const conds = await getMarketConditions({
      spyChange: async () => 0,
      vixFetcher: async () => ({ vix: 33 }),
      dataDir,
      now: NOW,
      vixTtlMs: 10 * 60_000,
    });
    expect(conds.vix).toBe(33);
    // The refetched value was persisted with the current timestamp.
    const raw = await readFile(
      path.join(dataDir, "control", "market-conditions.json"),
      "utf8",
    );
    expect(JSON.parse(raw)).toEqual({ vix: 33, fetchedAt: NOW.toISOString() });
  });

  it("falls back to neutral (no source, empty cache) without writing a bogus value", async () => {
    const dataDir = await tmp();
    const conds = await getMarketConditions({
      spyChange: async () => 0,
      dataDir,
      now: NOW,
    });
    expect(conds.vix).toBe(NEUTRAL_MARKET.vix);
    // Nothing fetched → nothing cached.
    await expect(
      readFile(path.join(dataDir, "control", "market-conditions.json"), "utf8"),
    ).rejects.toThrow();
  });
});
