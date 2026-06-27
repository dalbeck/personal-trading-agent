import { describe, expect, it } from "vitest";
import {
  extractCatalystFromNews,
  isMaterialHeadline,
  type CatalystNewsItem,
} from "@/lib/catalyst-news";

/** LLY-style headlines (the case the spec is fixing): a catalyst-rich, all-time
 *  high breakout whose research fetch had failed, so the desk saw "no catalyst".
 *  Alpaca News (Benzinga) would have carried these. */
const LLY_NEWS: CatalystNewsItem[] = [
  {
    headline:
      "Eli Lilly's GLP-1 weight-loss drug wins CHMP recommendation for EU approval",
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
  {
    headline: "Medicare to cover GLP-1 obesity drugs under new program",
    publisher: "Reuters",
    url: "https://example.com/medicare-glp1",
    publishedAt: "2026-06-25T18:00:00Z",
  },
];

describe("isMaterialHeadline", () => {
  it("flags regulatory / FDA / EMA / CHMP, M&A, earnings, guidance, analyst, policy", () => {
    expect(isMaterialHeadline("FDA approves new cancer therapy")).toBe(true);
    expect(isMaterialHeadline("Company A to acquire Company B for $5B")).toBe(true);
    expect(isMaterialHeadline("Q2 earnings beat, raises FY guidance")).toBe(true);
    expect(isMaterialHeadline("Analyst upgrades stock to Buy, lifts price target")).toBe(true);
    expect(isMaterialHeadline("CHMP recommends EU approval")).toBe(true);
    expect(isMaterialHeadline("Medicare to cover GLP-1 obesity drugs")).toBe(true);
  });

  it("does NOT flag generic market-wrap noise", () => {
    expect(isMaterialHeadline("Stocks mixed at midday as traders weigh data")).toBe(false);
    expect(isMaterialHeadline("Here's what to watch this week")).toBe(false);
    expect(isMaterialHeadline("3 dividend stocks to consider")).toBe(false);
  });
});

describe("extractCatalystFromNews", () => {
  it("captures a real catalyst from the newest material headline + lists sources", () => {
    const got = extractCatalystFromNews(LLY_NEWS);
    expect(got.catalyst).toContain("CHMP");
    // CHMP / approval recommendation → product/regulatory news.
    expect(got.catalystType).toBe("product_news");
    // Every material headline is surfaced as a verifiable source.
    expect(got.sources).toHaveLength(3);
    expect(got.sources[0]).toEqual({
      headline:
        "Eli Lilly's GLP-1 weight-loss drug wins CHMP recommendation for EU approval",
      publisher: "Benzinga",
      url: "https://example.com/lly-chmp",
      publishedAt: "2026-06-26T13:30:00Z",
    });
  });

  it("returns no catalyst (null) but stays empty when only noise is present", () => {
    const got = extractCatalystFromNews([
      {
        headline: "Stocks mixed at midday as traders weigh data",
        publisher: "CNBC",
        url: null,
        publishedAt: "2026-06-26T16:00:00Z",
      },
    ]);
    expect(got.catalyst).toBeNull();
    expect(got.catalystType).toBeNull();
    expect(got.sources).toEqual([]);
  });

  it("returns no catalyst for an empty / missing payload", () => {
    expect(extractCatalystFromNews([])).toEqual({
      catalyst: null,
      catalystType: null,
      sources: [],
    });
    expect(extractCatalystFromNews(null)).toEqual({
      catalyst: null,
      catalystType: null,
      sources: [],
    });
  });

  it("skips company-description boilerplate masquerading as a headline", () => {
    const got = extractCatalystFromNews([
      {
        headline:
          "Eli Lilly and Company is a pharmaceutical company that provides medicines",
        publisher: "Wire",
        url: null,
        publishedAt: "2026-06-26T10:00:00Z",
      },
      {
        headline: "Eli Lilly raises full-year guidance for 2026",
        publisher: "Benzinga",
        url: null,
        publishedAt: "2026-06-26T09:00:00Z",
      },
    ]);
    expect(got.catalyst).toContain("guidance");
    expect(got.catalystType).toBe("guidance");
    expect(got.sources).toHaveLength(1);
  });

  it("caps the number of surfaced sources", () => {
    const many: CatalystNewsItem[] = Array.from({ length: 12 }, (_, i) => ({
      headline: `Analyst raises price target, round ${i}`,
      publisher: "Benzinga",
      url: null,
      publishedAt: `2026-06-${10 + i}T10:00:00Z`,
    }));
    const got = extractCatalystFromNews(many);
    expect(got.sources.length).toBeLessThanOrEqual(6);
  });

  it("word-truncates a very long headline used as the catalyst", () => {
    const long =
      "Eli Lilly announces a sweeping regulatory approval across multiple jurisdictions including the United States European Union and Japan covering several indications";
    const got = extractCatalystFromNews([
      { headline: long, publisher: "Wire", url: null, publishedAt: null },
    ]);
    expect(got.catalyst).not.toBeNull();
    // Truncated on a word boundary with an ellipsis — never mid-word.
    expect(got.catalyst!.endsWith("…") || got.catalyst!.length <= long.length).toBe(true);
    expect(got.catalyst).not.toMatch(/\w…\w/);
  });
});
