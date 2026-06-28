// src/lib/server/research/fmp.test.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFmpProvider } from "./fmp";
import { readResearchDiagnostics } from "./diagnostics";
import { getResearchCallCount } from "./usage";

let dir: string;
const clock = () => new Date("2026-06-27T12:00:00.000Z");
const DATE = "2026-06-27";

// ---------------------------------------------------------------------------
// Realistic FMP STABLE fixture bodies (field names mirror live stable payloads).
// ---------------------------------------------------------------------------

const profileBody = JSON.stringify([
  {
    symbol: "AAPL",
    marketCap: 2_800_000_000_000, // stable: `marketCap` (was `mktCap`)
    companyName: "Apple Inc.",
    website: "https://www.apple.com",
    ceo: "Tim Cook",
    sector: "Technology",
    industry: "Consumer Electronics",
    country: "US",
    exchange: "NASDAQ", // stable: `exchange` (was `exchangeShortName`)
    ipoDate: "1980-12-12",
    fullTimeEmployees: "161000", // stable returns this as a string
    description: "Apple Inc. designs, manufactures, and markets smartphones.",
  },
]);

const ratiosTtmBody = JSON.stringify([
  {
    priceToEarningsRatioTTM: 28.5, // was `peRatioTTM`
    netIncomePerShareTTM: 6.42, // stable: EPS lives on ratios-ttm
    dividendYieldTTM: 0.0044,
    dividendPayoutRatioTTM: 0.157, // was `payoutRatioTTM`
    debtToEquityRatioTTM: 1.87, // was `debtEquityRatioTTM`
    interestCoverageRatioTTM: 29.3, // was `interestCoverageTTM`
  },
]);

const keyMetricsTtmBody = JSON.stringify([
  {
    marketCap: 2_800_000_000_000, // stable: `marketCap` (was `marketCapTTM`)
    freeCashFlowYieldTTM: 0.041,
    enterpriseValueTTM: 2_900_000_000_000,
  },
]);

const cashFlowBody = JSON.stringify([
  {
    operatingCashFlow: 110_000_000_000,
    freeCashFlow: 100_000_000_000,
    netDividendsPaid: -15_000_000_000, // stable: `netDividendsPaid` (was `dividendsPaid`)
    dividendsPaid: null,
  },
  {
    operatingCashFlow: 95_000_000_000,
    freeCashFlow: 85_000_000_000,
    netDividendsPaid: -14_000_000_000,
    dividendsPaid: null,
  },
]);

const balanceSheetBody = JSON.stringify([
  { netDebt: 76_443_000_000, totalDebt: 112_377_000_000 },
]);

// stable `dividends`: a flat array (was `{ historical: [...] }`)
const dividendBody = JSON.stringify([
  { date: "2025-11-07", dividend: 0.25 },
  { date: "2025-08-08", dividend: 0.25 },
  { date: "2025-05-09", dividend: 0.25 },
  { date: "2025-02-07", dividend: 0.25 },
  { date: "2024-11-08", dividend: 0.24 },
  { date: "2024-08-09", dividend: 0.24 },
  { date: "2024-05-10", dividend: 0.24 },
  { date: "2024-02-09", dividend: 0.24 },
  { date: "2023-11-10", dividend: 0.23 },
  { date: "2023-08-11", dividend: 0.23 },
  { date: "2023-05-12", dividend: 0.23 },
  { date: "2023-02-10", dividend: 0.23 },
]);

/** Build a mock fetchImpl that routes by stable URL path substring. */
function makeFetchImpl(
  overrides: Record<string, () => Response> = {},
): typeof fetch {
  return (async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    if (urlStr.includes("balance-sheet-statement")) {
      return overrides["balance-sheet-statement"]?.() ?? new Response(balanceSheetBody, { status: 200 });
    }
    if (urlStr.includes("cash-flow-statement")) {
      return overrides["cash-flow-statement"]?.() ?? new Response(cashFlowBody, { status: 200 });
    }
    if (urlStr.includes("dividends")) {
      return overrides["dividends"]?.() ?? new Response(dividendBody, { status: 200 });
    }
    if (urlStr.includes("key-metrics-ttm")) {
      return overrides["key-metrics-ttm"]?.() ?? new Response(keyMetricsTtmBody, { status: 200 });
    }
    if (urlStr.includes("ratios-ttm")) {
      return overrides["ratios-ttm"]?.() ?? new Response(ratiosTtmBody, { status: 200 });
    }
    if (urlStr.includes("profile")) {
      return overrides["profile"]?.() ?? new Response(profileBody, { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "fmp-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("createFmpProvider", () => {
  it("ok path: returns a ResearchResult with cashFlow+fundamentals+dividend populated", async () => {
    const p = createFmpProvider({
      apiKey: "test-key",
      dataDir: dir,
      now: clock,
      fetchImpl: makeFetchImpl(),
    });

    const result = await p.research({ symbol: "AAPL" });

    expect(result).not.toBeNull();
    expect(result?.provider).toBe("fmp");
    expect(result?.symbol).toBe("AAPL");
    expect(result?.cashFlow).not.toBeNull();
    expect(result?.fundamentals).not.toBeNull();
    expect(result?.dividend).not.toBeNull();
    expect(result?.profile).not.toBeNull();
    expect(result?.tickers).toContain("AAPL");
    expect(result?.summary).toBe("");
    expect(result?.sources).toEqual([]);
    expect(result?.consensus).toBeNull();

    // lastDiagnostic
    expect(p.lastDiagnostic?.()?.outcome).toBe("ok");
    expect(p.lastDiagnostic?.()?.provider).toBe("fmp");
    expect(p.lastDiagnostic?.()?.symbol).toBe("AAPL");

    // metered exactly once
    expect(await getResearchCallCount(DATE, { dataDir: dir })).toBe(1);

    // diagnostic persisted to the ring
    const ring = await readResearchDiagnostics({ dataDir: dir });
    expect(ring.length).toBeGreaterThan(0);
    expect(ring[0].provider).toBe("fmp");
    expect(ring[0].outcome).toBe("ok");
  });

  it("maps STABLE field names end-to-end (renamed ratios/profile fields + balance-sheet netDebt)", async () => {
    const p = createFmpProvider({
      apiKey: "test-key",
      dataDir: dir,
      now: clock,
      fetchImpl: makeFetchImpl(),
    });

    const r = await p.research({ symbol: "AAPL" });

    // profile renames
    expect(r?.profile?.exchange).toBe("NASDAQ"); // from `exchange`
    expect(r?.profile?.employees).toBe(161000); // from string "161000"
    expect(r?.fundamentals?.marketCap).toBe(2_800_000_000_000); // from `marketCap`
    // ratios-ttm renames
    expect(r?.fundamentals?.peRatio).toBeCloseTo(28.5); // priceToEarningsRatioTTM
    expect(r?.fundamentals?.eps).toBeCloseTo(6.42); // netIncomePerShareTTM (on ratios-ttm)
    expect(r?.cashFlow?.debtToEquity).toBeCloseTo(1.87); // debtToEquityRatioTTM
    expect(r?.cashFlow?.interestCoverage).toBeCloseTo(29.3); // interestCoverageRatioTTM
    expect(r?.dividend?.payoutRatio).toBeCloseTo(0.157); // dividendPayoutRatioTTM
    // balance-sheet netDebt (was null on v3)
    expect(r?.cashFlow?.netDebt).toBe(76_443_000_000);
    // dividends flat array → streak/cagr derived
    expect(r?.dividend?.growthStreakYears).not.toBeNull();
    // fcfPayout derived from abs(netDividendsPaid)/freeCashFlow
    expect(r?.dividend?.fcfPayout).toBeCloseTo(15_000_000_000 / 100_000_000_000, 4);
  });

  it("no-api-key: returns null, emits no-api-key, does NOT meter", async () => {
    const p = createFmpProvider({
      apiKey: "",
      dataDir: dir,
      now: clock,
    });

    expect(await p.research({ symbol: "AAPL" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("no-api-key");
    expect(await getResearchCallCount(DATE, { dataDir: dir })).toBe(0);
  });

  it("http-error 401: returns null, emits http-error with status 401", async () => {
    const fetchImpl = makeFetchImpl({
      profile: () => new Response("Unauthorized", { status: 401 }),
      "ratios-ttm": () => new Response("Unauthorized", { status: 401 }),
      "key-metrics-ttm": () => new Response("Unauthorized", { status: 401 }),
      "cash-flow-statement": () => new Response("Unauthorized", { status: 401 }),
      "balance-sheet-statement": () => new Response("Unauthorized", { status: 401 }),
      dividends: () => new Response("Unauthorized", { status: 401 }),
    });

    const p = createFmpProvider({
      apiKey: "bad-key",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });

    expect(await p.research({ symbol: "AAPL" })).toBeNull();
    const d = p.lastDiagnostic?.();
    expect(d?.outcome).toBe("http-error");
    expect(d?.httpStatus).toBe(401);
    expect(await getResearchCallCount(DATE, { dataDir: dir })).toBe(0);
  });

  it("timeout: returns null, emits timeout when all fetches throw TimeoutError", async () => {
    const fetchImpl = (async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    }) as unknown as typeof fetch;

    const p = createFmpProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });

    expect(await p.research({ symbol: "AAPL" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("timeout");
  });

  it("daily-cap-reached: returns null, does NOT meter, emits daily-cap-reached", async () => {
    const p = createFmpProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl: makeFetchImpl(),
      dailyCap: 0,
    });

    expect(await p.research({ symbol: "AAPL" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("daily-cap-reached");
    expect(await getResearchCallCount(DATE, { dataDir: dir })).toBe(0);
  });

  it("parse-error / all-empty bodies: returns null, emits parse-error, does NOT meter", async () => {
    const fetchImpl = makeFetchImpl({
      profile: () => new Response("[]", { status: 200 }),
      "ratios-ttm": () => new Response("[]", { status: 200 }),
      "key-metrics-ttm": () => new Response("[]", { status: 200 }),
      "cash-flow-statement": () => new Response("[]", { status: 200 }),
      "balance-sheet-statement": () => new Response("[]", { status: 200 }),
      dividends: () => new Response("[]", { status: 200 }),
    });

    const p = createFmpProvider({
      apiKey: "k",
      dataDir: dir,
      now: clock,
      fetchImpl,
    });

    expect(await p.research({ symbol: "AAPL" })).toBeNull();
    expect(p.lastDiagnostic?.()?.outcome).toBe("parse-error");
    expect(await getResearchCallCount(DATE, { dataDir: dir })).toBe(0);
  });
});
