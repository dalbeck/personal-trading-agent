import { describe, expect, it, vi } from "vitest";
import { captureCatalyst } from "@/lib/server/catalyst-capture";
import type { CatalystNewsItem } from "@/lib/catalyst-news";

const LLY_NEWS: CatalystNewsItem[] = [
  {
    headline: "Eli Lilly wins CHMP recommendation for EU approval of its GLP-1 drug",
    publisher: "Benzinga",
    url: "https://example.com/lly-chmp",
    publishedAt: "2026-06-26T13:30:00Z",
  },
  {
    headline: "Morgan Stanley raises Eli Lilly price target to $1,100",
    publisher: "Benzinga",
    url: "https://example.com/lly-pt",
    publishedAt: "2026-06-26T11:00:00Z",
  },
];

describe("captureCatalyst — multi-source with fallback chain", () => {
  it("captures the catalyst from Alpaca News (primary) with sources listed", async () => {
    const got = await captureCatalyst({
      symbol: "LLY",
      perplexityCatalysts: null,
      fetchNews: async () => LLY_NEWS,
    });
    expect(got.source).toBe("alpaca-news");
    expect(got.catalyst).toContain("CHMP");
    expect(got.catalystType).toBe("product_news");
    expect(got.state).toBe("found");
    expect(got.sources).toHaveLength(2);
    expect(got.sources[0].publisher).toBe("Benzinga");
  });

  it("falls back to Perplexity catalysts when the news fetch FAILS (never 'no catalyst')", async () => {
    const fetchNews = vi.fn(async () => {
      throw new Error("alpaca news 500");
    });
    const got = await captureCatalyst({
      symbol: "LLY",
      perplexityCatalysts: ["Q2 beat-and-raise; FY guidance lifted"],
      fetchNews,
      newsRetries: 1,
    });
    // News was retried then abandoned — fell back, not "no catalyst".
    expect(fetchNews).toHaveBeenCalledTimes(2);
    expect(got.source).toBe("perplexity");
    expect(got.catalyst).toContain("guidance");
    expect(got.catalystType).toBe("earnings_momentum"); // "beat" → earnings momentum
    expect(got.sources).toEqual([]); // Perplexity phrases carry no headline source
  });

  it("retries a flaky news fetch then captures from news once it succeeds", async () => {
    let calls = 0;
    const fetchNews = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return LLY_NEWS;
    });
    const got = await captureCatalyst({
      symbol: "LLY",
      perplexityCatalysts: ["weaker fallback"],
      fetchNews,
      newsRetries: 1,
    });
    expect(fetchNews).toHaveBeenCalledTimes(2);
    expect(got.source).toBe("alpaca-news");
    expect(got.catalyst).toContain("CHMP");
  });

  it("falls back to Perplexity when news returns only noise", async () => {
    const got = await captureCatalyst({
      symbol: "LLY",
      perplexityCatalysts: ["Oversold RSI bounce off long-term support"],
      fetchNews: async () => [
        {
          headline: "Stocks mixed at midday as traders weigh data",
          publisher: "CNBC",
          url: null,
          publishedAt: "2026-06-26T16:00:00Z",
        },
      ],
    });
    expect(got.source).toBe("perplexity");
    expect(got.catalyst).toContain("Oversold");
  });

  it("state 'none' — sources SEARCHED but nothing material (not a failure)", async () => {
    const got = await captureCatalyst({
      symbol: "LLY",
      perplexityCatalysts: [],
      perplexityStatus: "ok",
      fetchNews: async () => [], // searched, returned nothing
    });
    expect(got).toEqual({
      catalyst: null,
      catalystType: null,
      sources: [],
      source: null,
      state: "none",
    });
  });

  it("state 'none' when news searched (empty) even if Perplexity was off", async () => {
    const got = await captureCatalyst({
      symbol: "LLY",
      perplexityCatalysts: null,
      perplexityStatus: "off",
      fetchNews: async () => [],
    });
    expect(got.state).toBe("none");
  });

  it("state 'unavailable' when EVERY source's fetch FAILED — never conflated with 'none'", async () => {
    const got = await captureCatalyst({
      symbol: "LLY",
      perplexityCatalysts: null,
      perplexityStatus: "unavailable", // Perplexity fetch failed too
      fetchNews: async () => {
        throw new Error("alpaca down");
      },
      newsRetries: 0,
    });
    expect(got.catalyst).toBeNull();
    expect(got.source).toBeNull();
    expect(got.state).toBe("unavailable");
  });

  it("does not throw when BOTH sources fail — yields an 'unavailable' catalyst", async () => {
    const got = await captureCatalyst({
      symbol: "LLY",
      perplexityCatalysts: null,
      fetchNews: async () => {
        throw new Error("down");
      },
      newsRetries: 0,
    });
    expect(got.catalyst).toBeNull();
    expect(got.source).toBeNull();
    expect(got.state).toBe("unavailable");
  });

  it("companyName filter: picks the symbol-primary EMA Approval headline, drops roundup and non-primary policy headline", async () => {
    // Newest-first mixed set for LLY — mirrors what the plan spec requires.
    const MIXED_LLY: CatalystNewsItem[] = [
      {
        // roundup — should be filtered out (isMultiTickerRoundup)
        headline: "Apogee Therapeutics And 4 Other Stocks Moving Higher Wednesday",
        publisher: "Benzinga",
        url: "https://example.com/roundup",
        publishedAt: "2026-06-27T15:00:00Z",
      },
      {
        // policy headline — material but does NOT name Eli Lilly → not symbol-primary
        headline: "Medicare To Cover GLP-1 Obesity Drugs Under New Program",
        publisher: "Reuters",
        url: "https://example.com/medicare",
        publishedAt: "2026-06-27T14:00:00Z",
      },
      {
        // analyst upgrade — names Eli Lilly → symbol-primary, tier-2 materiality
        headline: "Eli Lilly Raised To Overweight At Morgan Stanley",
        publisher: "Benzinga",
        url: "https://example.com/lly-upgrade",
        publishedAt: "2026-06-27T12:00:00Z",
      },
      {
        // approval headline — names Eli Lilly → symbol-primary, tier-3 materiality
        headline: "Eli Lilly Wins EMA Approval For Tirzepatide In Europe",
        publisher: "Benzinga",
        url: "https://example.com/lly-ema",
        publishedAt: "2026-06-27T10:00:00Z",
      },
    ];

    const got = await captureCatalyst({
      symbol: "LLY",
      companyName: "Eli Lilly, Inc.",
      perplexityStatus: "ok",
      fetchNews: async () => MIXED_LLY,
    });

    // Should surface the EMA Approval (highest materiality, symbol-primary).
    expect(got.state).toBe("found");
    expect(got.source).toBe("alpaca-news");
    expect(got.catalyst).toContain("EMA Approval");
    expect(got.catalystType).toBe("product_news");

    // The roundup must NOT appear in sources.
    const sourceHeadlines = got.sources.map((s) => s.headline);
    expect(sourceHeadlines.some((h) => h.includes("Apogee Therapeutics"))).toBe(false);
    // The Medicare headline must NOT appear in sources (not symbol-primary for LLY).
    expect(sourceHeadlines.some((h) => h.includes("Medicare"))).toBe(false);
    // The Eli Lilly analyst and approval headlines SHOULD appear.
    expect(sourceHeadlines.some((h) => h.includes("EMA Approval"))).toBe(true);
  });
});
