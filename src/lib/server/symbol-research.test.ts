import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  getResearchFreshness,
  getSymbolResearch,
  mergeSymbolResearch,
} from "./symbol-research";
import type {
  ResearchFundamentals,
  ResearchProfile,
  ResearchProvider,
  ResearchResult,
} from "./research/types";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-symbol-research-"));
}

const NOW = () => new Date("2026-06-25T12:00:00Z");

function rhData(): { fundamentals: ResearchFundamentals; profile: ResearchProfile } {
  return {
    fundamentals: { marketCap: 4e12, peRatio: 35, eps: null, dividendYield: 0.0036 },
    profile: {
      name: "Apple, Inc.",
      domain: null,
      ceo: "Tim Cook",
      employees: 166000,
      sector: "Electronic Technology",
      industry: "Telecommunications Equipment",
      country: null,
      exchange: null,
      ipoDate: null,
      description: "RH description.",
    },
  };
}

function pplxResult(): ResearchResult {
  return {
    provider: "perplexity",
    symbol: "MSFT",
    summary: "AI narrative.",
    sources: [],
    usedAt: "2026-06-25T12:00:00Z",
    finance: [],
    categories: [],
    tickers: [],
    consensus: {
      rating: "Buy",
      targetMean: 500,
      targetHigh: 560,
      targetLow: 440,
      analystCount: 40,
    },
    fundamentals: { marketCap: 3.1e12, peRatio: 36, eps: 11.9, dividendYield: 0.0072 },
    profile: {
      name: "PPLX Name",
      domain: null,
      ceo: "PPLX CEO",
      employees: 1,
      sector: "PPLX Sector",
      industry: "PPLX Industry",
      country: "United States",
      exchange: "NASDAQ",
      ipoDate: "1986-03-13",
      description: "PPLX description.",
    },
  };
}

describe("mergeSymbolResearch", () => {
  it("prefers Robinhood for fundamentals/profile, fills gaps from Perplexity", () => {
    const merged = mergeSymbolResearch({
      rh: rhData(),
      perplexity: pplxResult(),
      fmp: null,
      robinhoodConnected: true,
      perplexityStatus: "ok",
      perplexityReason: null,
    });
    // Robinhood wins where it has data.
    expect(merged.fundamentals!.marketCap).toBe(4e12);
    expect(merged.fundamentalsSource).toBe("robinhood");
    expect(merged.profile!.ceo).toBe("Tim Cook");
    expect(merged.profileSource).toBe("robinhood");
    // Perplexity fills the fields Robinhood lacks.
    expect(merged.fundamentals!.eps).toBeCloseTo(11.9);
    expect(merged.profile!.exchange).toBe("NASDAQ");
    expect(merged.profile!.ipoDate).toBe("1986-03-13");
    // Consensus + summary are Perplexity only.
    expect(merged.consensus!.rating).toBe("Buy");
    expect(merged.summary).toBe("AI narrative.");
  });

  it("prefers FMP over Perplexity for structured fundamentals/cashFlow/dividend (M2)", () => {
    const fmp: ResearchResult = {
      provider: "fmp",
      symbol: "LLY",
      summary: "",
      sources: [],
      usedAt: "2026-06-25T12:00:00Z",
      finance: [],
      categories: [],
      tickers: [],
      consensus: null,
      earnings: [],
      catalysts: [],
      fundamentals: { marketCap: 8e11, peRatio: 52, eps: 14.2, dividendYield: 0.006 },
      profile: null,
      cashFlow: {
        operatingCashFlow: null,
        freeCashFlow: 5e9,
        fcfTrend: "growing",
        fcfYield: 0.032,
        netDebt: 1e9,
        debtToEquity: 0.4,
        interestCoverage: 18,
      },
      dividend: {
        dividendYield: 0.006,
        payoutRatio: 0.3,
        fcfPayout: null,
        fcfCoverage: 4.5,
        growthStreakYears: 10,
        dividendCagr: null,
      },
    };
    const merged = mergeSymbolResearch({
      rh: null, // no Robinhood → FMP is the top structured source
      perplexity: pplxResult(), // has fundamentals but no cashFlow/dividend
      fmp,
      robinhoodConnected: false,
      perplexityStatus: "ok",
      perplexityReason: null,
    });
    // FMP wins for structured fundamentals + value data.
    expect(merged.fundamentalsSource).toBe("fmp");
    expect(merged.fundamentals!.marketCap).toBe(8e11);
    expect(merged.cashFlowSource).toBe("fmp");
    expect(merged.cashFlow!.freeCashFlow).toBe(5e9);
    expect(merged.dividendSource).toBe("fmp");
    // Perplexity still owns the narrative + consensus.
    expect(merged.summary).toBe("AI narrative.");
    expect(merged.consensus!.rating).toBe("Buy");
  });

  it("uses Perplexity for everything when Robinhood is absent", () => {
    const merged = mergeSymbolResearch({
      rh: null,
      perplexity: pplxResult(),
      fmp: null,
      robinhoodConnected: false,
      perplexityStatus: "ok",
      perplexityReason: null,
    });
    expect(merged.fundamentalsSource).toBe("perplexity");
    expect(merged.profileSource).toBe("perplexity");
    expect(merged.fundamentals!.marketCap).toBe(3.1e12);
  });

  it("nulls everything when neither source has data", () => {
    const merged = mergeSymbolResearch({
      rh: null,
      perplexity: null,
      fmp: null,
      robinhoodConnected: false,
      perplexityStatus: "off",
      perplexityReason: null,
    });
    expect(merged.fundamentals).toBeNull();
    expect(merged.profile).toBeNull();
    expect(merged.consensus).toBeNull();
    expect(merged.summary).toBe("");
    expect(merged.fundamentalsSource).toBeNull();
    expect(merged.perplexity).toBe("off");
  });
});

describe("getSymbolResearch", () => {
  it("merges Robinhood + Perplexity, caches by symbol, and serves a fresh cache", async () => {
    const dir = await tmp();
    const fetchRobinhood = vi.fn(async () => rhData());
    const research = vi.fn(async () => pplxResult());
    const provider: ResearchProvider = { name: "perplexity", research };

    const first = await getSymbolResearch("MSFT", {
      dataDir: dir,
      robinhoodConnected: true,
      fetchRobinhood,
      provider,
      now: NOW,
    });
    expect(first.cached).toBe(false);
    expect(first.fetchedAt).toBe("2026-06-25T12:00:00.000Z");
    expect(first.fundamentalsSource).toBe("robinhood");
    expect(first.consensus!.rating).toBe("Buy");
    expect(fetchRobinhood).toHaveBeenCalledOnce();
    expect(research).toHaveBeenCalledOnce();

    // A later view within the soft max-age is served from cache — no re-spend.
    const second = await getSymbolResearch("MSFT", {
      dataDir: dir,
      robinhoodConnected: true,
      fetchRobinhood,
      provider,
      now: () => new Date("2026-06-25T15:00:00Z"),
    });
    expect(second.cached).toBe(true);
    expect(second.fetchedAt).toBe("2026-06-25T12:00:00.000Z"); // original stamp
    expect(second.fundamentals!.marketCap).toBe(4e12);
    expect(fetchRobinhood).toHaveBeenCalledOnce(); // not called again
    expect(research).toHaveBeenCalledOnce(); // not called again
  });

  it("a manual refresh (force) re-spends even when the cache is fresh", async () => {
    const dir = await tmp();
    const fetchRobinhood = vi.fn(async () => rhData());
    const research = vi.fn(async () => pplxResult());
    const provider: ResearchProvider = { name: "perplexity", research };
    const base = {
      dataDir: dir,
      robinhoodConnected: true,
      fetchRobinhood,
      provider,
    };

    await getSymbolResearch("MSFT", { ...base, now: NOW });
    const forced = await getSymbolResearch("MSFT", {
      ...base,
      now: () => new Date("2026-06-25T13:00:00Z"),
      force: true,
    });
    expect(forced.cached).toBe(false);
    expect(forced.fetchedAt).toBe("2026-06-25T13:00:00.000Z"); // re-stamped
    expect(fetchRobinhood).toHaveBeenCalledTimes(2);
    expect(research).toHaveBeenCalledTimes(2);
  });

  it("auto-refetches when the cache is older than the soft max-age", async () => {
    const dir = await tmp();
    const fetchRobinhood = vi.fn(async () => rhData());
    const research = vi.fn(async () => pplxResult());
    const provider: ResearchProvider = { name: "perplexity", research };
    const base = {
      dataDir: dir,
      robinhoodConnected: true,
      fetchRobinhood,
      provider,
      maxAgeMs: 7 * 86_400_000,
    };

    await getSymbolResearch("MSFT", { ...base, now: NOW });
    // 10 days later → past the 7-day soft cap → refetch.
    const stale = await getSymbolResearch("MSFT", {
      ...base,
      now: () => new Date("2026-07-05T12:00:00Z"),
    });
    expect(stale.cached).toBe(false);
    expect(fetchRobinhood).toHaveBeenCalledTimes(2);
  });

  it("a capped refresh keeps the prior cache and surfaces the capped status", async () => {
    const dir = await tmp();
    // First: a good cache (Robinhood + Perplexity).
    await getSymbolResearch("MSFT", {
      dataDir: dir,
      robinhoodConnected: true,
      fetchRobinhood: async () => rhData(),
      provider: { name: "perplexity", research: async () => pplxResult() },
      now: NOW,
    });
    // Forced refresh that comes back empty (no Robinhood, provider null, capped).
    const refreshed = await getSymbolResearch("MSFT", {
      dataDir: dir,
      robinhoodConnected: false,
      provider: { name: "perplexity", research: async () => null },
      dailyCap: 0,
      force: true,
      now: () => new Date("2026-06-25T16:00:00Z"),
    });
    expect(refreshed.perplexity).toBe("capped");
    // The good prior data is preserved — a capped refresh never wipes the cache.
    expect(refreshed.fundamentals!.marketCap).toBe(4e12);
    expect(refreshed.fetchedAt).toBe("2026-06-25T12:00:00.000Z");
  });

  it("reports perplexity 'off' without calling the provider, still uses Robinhood", async () => {
    const dir = await tmp();
    const research = vi.fn(async () => null);
    const research_result = await getSymbolResearch("AMD", {
      dataDir: dir,
      robinhoodConnected: true,
      fetchRobinhood: async () => rhData(),
      provider: { name: "off", research },
      now: NOW,
    });
    expect(research_result.perplexity).toBe("off");
    expect(research).not.toHaveBeenCalled();
    expect(research_result.fundamentalsSource).toBe("robinhood");
  });

  it("distinguishes capped from unavailable when the provider returns null", async () => {
    const capped = await getSymbolResearch("NVDA", {
      dataDir: await tmp(),
      robinhoodConnected: false,
      provider: { name: "perplexity", research: async () => null },
      dailyCap: 0, // used (0) >= cap (0) → capped
      now: NOW,
    });
    expect(capped.perplexity).toBe("capped");

    const unavailable = await getSymbolResearch("NVDA", {
      dataDir: await tmp(),
      robinhoodConnected: false,
      provider: { name: "perplexity", research: async () => null },
      dailyCap: 30, // used (0) < cap → unavailable
      now: NOW,
    });
    expect(unavailable.perplexity).toBe("unavailable");
  });
});

describe("perplexityReason", () => {
  it("surfaces a specific perplexityReason from the provider diagnostic", async () => {
    const dir = await tmp();
    const provider = {
      name: "perplexity",
      research: async () => null,
      lastDiagnostic: () => ({
        at: "2026-06-27T12:00:00.000Z",
        provider: "perplexity",
        symbol: "LLY",
        outcome: "http-error" as const,
        httpStatus: 402,
        latencyMs: 10,
      }),
    };
    const res = await getSymbolResearch("LLY", {
      provider,
      robinhoodConnected: false,
      dataDir: dir,
      now: NOW,
    });
    expect(res.perplexity).toBe("unavailable");
    expect(res.perplexityReason).toBe("HTTP 402 (check API billing)");
  });
});

describe("getResearchFreshness", () => {
  it("returns the cached fetchedAt without fetching (no spend)", async () => {
    const dir = await tmp();
    const research = vi.fn(async () => pplxResult());
    await getSymbolResearch("MSFT", {
      dataDir: dir,
      robinhoodConnected: true,
      fetchRobinhood: async () => rhData(),
      provider: { name: "perplexity", research },
      now: NOW,
    });
    research.mockClear();

    const fresh = await getResearchFreshness("MSFT", { dataDir: dir });
    expect(fresh.fetchedAt).toBe("2026-06-25T12:00:00.000Z");
    expect(research).not.toHaveBeenCalled(); // cache-only — never fetches
  });

  it("returns null fetchedAt when nothing is cached", async () => {
    const dir = await tmp();
    expect(await getResearchFreshness("AMD", { dataDir: dir })).toEqual({
      fetchedAt: null,
    });
  });
});

// ---------------------------------------------------------------------------
// FMP primary chain tests (fmp-primary-for-fundamentals M2)
// ---------------------------------------------------------------------------

function fmpResult(): ResearchResult {
  return {
    provider: "fmp",
    symbol: "LLY",
    summary: "",
    sources: [],
    usedAt: "2026-06-25T12:00:00Z",
    finance: [],
    categories: [],
    tickers: [],
    fundamentals: { marketCap: 8e11, peRatio: 52, eps: 14.2, dividendYield: 0.006 },
    profile: {
      name: "Eli Lilly",
      domain: "lilly.com",
      ceo: "David Ricks",
      employees: 43000,
      sector: "Health Technology",
      industry: "Pharmaceuticals",
      country: "United States",
      exchange: "NYSE",
      ipoDate: null,
      description: "FMP description.",
    },
    cashFlow: {
      operatingCashFlow: null,
      freeCashFlow: 5e9,
      fcfTrend: "growing",
      fcfYield: 0.032,
      netDebt: null,
      debtToEquity: null,
      interestCoverage: 18,
    },
    dividend: {
      dividendYield: 0.006,
      payoutRatio: 0.30,
      fcfPayout: null,
      fcfCoverage: 4.5,
      growthStreakYears: 10,
      dividendCagr: null,
    },
  };
}

describe("FMP primary chain", () => {
  it("uses FMP when Perplexity is down and Perplexity did not supply value data", async () => {
    const dir = await tmp();
    const fmpResearch = vi.fn(async () => fmpResult());
    const fmpProvider: ResearchProvider = { name: "fmp", research: fmpResearch };

    const res = await getSymbolResearch("LLY", {
      dataDir: dir,
      robinhoodConnected: false,
      provider: {
        name: "perplexity",
        research: async () => null,
        lastDiagnostic: () => ({
          at: "2026-06-25T12:00:00.000Z",
          provider: "perplexity",
          symbol: "LLY",
          outcome: "http-error" as const,
          httpStatus: 503,
          latencyMs: 100,
        }),
      },
      fmpProvider,
      now: NOW,
    });

    expect(fmpResearch).toHaveBeenCalledOnce();
    expect(res.cashFlow).not.toBeNull();
    expect(res.cashFlow!.freeCashFlow).toBe(5e9);
    expect(res.cashFlowSource).toBe("fmp");
    expect(res.dividend).not.toBeNull();
    expect(res.dividend!.growthStreakYears).toBe(10);
    expect(res.dividendSource).toBe("fmp");
    expect(res.fundamentals).not.toBeNull();
    expect(res.fundamentalsSource).toBe("fmp");
  });

  it("is consulted on every fetch and its structured value data is primary (over Perplexity)", async () => {
    // M2: FMP is the primary structured source. Even when Perplexity also
    // returns cashFlow/dividend, FMP's purpose-built figures win, and FMP is
    // ALWAYS called (not lazily, as in the old Perplexity-first chain).
    const dir = await tmp();
    const fmpResearch = vi.fn(async () => fmpResult());
    const fmpProvider: ResearchProvider = { name: "fmp", research: fmpResearch };

    const pplxWithValues: ResearchResult = {
      ...pplxResult(),
      cashFlow: {
        operatingCashFlow: null,
        freeCashFlow: 8e9,
        fcfTrend: "stable",
        fcfYield: 0.041,
        netDebt: null,
        debtToEquity: null,
        interestCoverage: 25,
      },
      dividend: {
        dividendYield: 0.0072,
        payoutRatio: 0.25,
        fcfPayout: null,
        fcfCoverage: 6,
        growthStreakYears: 12,
        dividendCagr: null,
      },
    };

    const res = await getSymbolResearch("MSFT", {
      dataDir: dir,
      robinhoodConnected: false,
      provider: { name: "perplexity", research: async () => pplxWithValues },
      fmpProvider,
      now: NOW,
    });

    expect(fmpResearch).toHaveBeenCalledOnce(); // always consulted, not lazy
    // FMP wins for structured value data + core fundamentals (RH absent here).
    expect(res.cashFlowSource).toBe("fmp");
    expect(res.cashFlow!.freeCashFlow).toBe(5e9); // FMP's figure, not Perplexity's 8e9
    expect(res.dividendSource).toBe("fmp");
    expect(res.fundamentalsSource).toBe("fmp");
    // Perplexity still supplies the narrative + consensus + catalysts.
    expect(res.summary).toBe("AI narrative.");
    expect(res.consensus!.rating).toBe("Buy");
  });

  it("falls through to Perplexity for structured value data when FMP has none (FMP → Perplexity)", async () => {
    // Free-tier-gated symbol: FMP returns profile/fundamentals but null cashFlow
    // /dividend (402 on statements). Perplexity's parsed values must fill in.
    const dir = await tmp();
    const fmpGatedResult: ResearchResult = {
      ...fmpResult(),
      cashFlow: null,
      dividend: null,
    };
    const fmpResearch = vi.fn(async () => fmpGatedResult);
    const fmpProvider: ResearchProvider = { name: "fmp", research: fmpResearch };

    const pplxWithValues: ResearchResult = {
      ...pplxResult(),
      cashFlow: {
        operatingCashFlow: null,
        freeCashFlow: 8e9,
        fcfTrend: "stable",
        fcfYield: 0.041,
        netDebt: null,
        debtToEquity: null,
        interestCoverage: 25,
      },
      dividend: {
        dividendYield: 0.0072,
        payoutRatio: 0.25,
        fcfPayout: null,
        fcfCoverage: 6,
        growthStreakYears: 12,
        dividendCagr: null,
      },
    };

    const res = await getSymbolResearch("VEEV", {
      dataDir: dir,
      robinhoodConnected: false,
      provider: { name: "perplexity", research: async () => pplxWithValues },
      fmpProvider,
      now: NOW,
    });

    expect(fmpResearch).toHaveBeenCalledOnce();
    expect(res.cashFlow!.freeCashFlow).toBe(8e9); // Perplexity's, since FMP had none
    expect(res.cashFlowSource).toBe("perplexity");
    expect(res.dividendSource).toBe("perplexity");
  });

  it("returns null cashFlow/dividend with null sources when both providers return nothing", async () => {
    const dir = await tmp();
    const fmpResearch = vi.fn(async () => null);
    const fmpProvider: ResearchProvider = { name: "fmp", research: fmpResearch };

    const res = await getSymbolResearch("NVDA", {
      dataDir: dir,
      robinhoodConnected: false,
      provider: { name: "perplexity", research: async () => null },
      fmpProvider,
      dailyCap: 30,
      now: NOW,
    });

    expect(res.cashFlow).toBeNull();
    expect(res.cashFlowSource).toBeNull();
    expect(res.dividend).toBeNull();
    expect(res.dividendSource).toBeNull();
  });
});
