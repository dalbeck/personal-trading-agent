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

  it("returns a null catalyst with empty sources when BOTH sources are empty", async () => {
    const got = await captureCatalyst({
      symbol: "LLY",
      perplexityCatalysts: [],
      fetchNews: async () => [],
    });
    expect(got).toEqual({
      catalyst: null,
      catalystType: null,
      sources: [],
      source: null,
    });
  });

  it("does not throw when BOTH sources fail — yields a null catalyst", async () => {
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
  });
});
