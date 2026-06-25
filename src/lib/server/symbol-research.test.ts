import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getSymbolResearch, mergeSymbolResearch } from "./symbol-research";
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
      robinhoodConnected: true,
      perplexityStatus: "ok",
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

  it("uses Perplexity for everything when Robinhood is absent", () => {
    const merged = mergeSymbolResearch({
      rh: null,
      perplexity: pplxResult(),
      robinhoodConnected: false,
      perplexityStatus: "ok",
    });
    expect(merged.fundamentalsSource).toBe("perplexity");
    expect(merged.profileSource).toBe("perplexity");
    expect(merged.fundamentals!.marketCap).toBe(3.1e12);
  });

  it("nulls everything when neither source has data", () => {
    const merged = mergeSymbolResearch({
      rh: null,
      perplexity: null,
      robinhoodConnected: false,
      perplexityStatus: "off",
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
  it("merges Robinhood + Perplexity and caches per-symbol-per-day", async () => {
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
    expect(first.fundamentalsSource).toBe("robinhood");
    expect(first.consensus!.rating).toBe("Buy");
    expect(fetchRobinhood).toHaveBeenCalledOnce();
    expect(research).toHaveBeenCalledOnce();

    // Second view the same day is served from cache — no fresh calls re-spent.
    const second = await getSymbolResearch("MSFT", {
      dataDir: dir,
      robinhoodConnected: true,
      fetchRobinhood,
      provider,
      now: () => new Date("2026-06-25T15:00:00Z"),
    });
    expect(second.cached).toBe(true);
    expect(second.fundamentals!.marketCap).toBe(4e12);
    expect(fetchRobinhood).toHaveBeenCalledOnce(); // not called again
    expect(research).toHaveBeenCalledOnce(); // not called again
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
