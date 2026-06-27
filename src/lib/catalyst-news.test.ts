import { describe, expect, it } from "vitest";
import {
  extractCatalystFromNews,
  isMaterialHeadline,
  isMultiTickerRoundup,
  companyNameMatches,
  isSymbolPrimarySubject,
  headlineMateriality,
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
  it("captures a real catalyst from the highest-materiality material headline + lists sources", () => {
    // LLY_NEWS: CHMP headline (materiality 3) is both newest AND highest — so
    // the result is the same as old behavior, but now driven by materiality rank.
    const got = extractCatalystFromNews(LLY_NEWS, { symbol: "LLY" });
    expect(got.catalyst).toContain("CHMP");
    // CHMP / approval recommendation → product/regulatory news.
    expect(got.catalystType).toBe("product_news");
    // All material headlines are surfaced as sources (materiality order — CHMP leads).
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
    const got = extractCatalystFromNews(
      [
        {
          headline: "Stocks mixed at midday as traders weigh data",
          publisher: "CNBC",
          url: null,
          publishedAt: "2026-06-26T16:00:00Z",
        },
      ],
      { symbol: "LLY" },
    );
    expect(got.catalyst).toBeNull();
    expect(got.catalystType).toBeNull();
    expect(got.sources).toEqual([]);
  });

  it("returns no catalyst for an empty / missing payload", () => {
    expect(extractCatalystFromNews([], { symbol: "LLY" })).toEqual({
      catalyst: null,
      catalystType: null,
      sources: [],
    });
    expect(extractCatalystFromNews(null, { symbol: "LLY" })).toEqual({
      catalyst: null,
      catalystType: null,
      sources: [],
    });
  });

  it("skips company-description boilerplate masquerading as a headline", () => {
    const got = extractCatalystFromNews(
      [
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
      ],
      { symbol: "LLY" },
    );
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
    const got = extractCatalystFromNews(many, { symbol: "LLY" });
    expect(got.sources.length).toBeLessThanOrEqual(6);
  });

  it("word-truncates a very long headline used as the catalyst", () => {
    const long =
      "Eli Lilly announces a sweeping regulatory approval across multiple jurisdictions including the United States European Union and Japan covering several indications";
    const got = extractCatalystFromNews(
      [{ headline: long, publisher: "Wire", url: null, publishedAt: null }],
      { symbol: "LLY" },
    );
    expect(got.catalyst).not.toBeNull();
    // Truncated on a word boundary with an ellipsis — never mid-word.
    expect(got.catalyst!.endsWith("…") || got.catalyst!.length <= long.length).toBe(true);
    expect(got.catalyst).not.toMatch(/\w…\w/);
  });
});

// ---------------------------------------------------------------------------
// Task 1: New pure helpers
// ---------------------------------------------------------------------------

describe("isMultiTickerRoundup", () => {
  it("returns TRUE for market-wrap / listicle / movers headlines", () => {
    expect(
      isMultiTickerRoundup(
        "Apogee Therapeutics And 4 Other Stocks Moving Higher Wednesday",
      ),
    ).toBe(true);
    expect(
      isMultiTickerRoundup("10 Stocks Moving In Tuesday's Mid-Day Session"),
    ).toBe(true);
    expect(
      isMultiTickerRoundup("Eli Lilly, Novo And 3 Other Stocks To Watch"),
    ).toBe(true);
    expect(isMultiTickerRoundup("Tech Stocks Moving Lower")).toBe(true);
    expect(isMultiTickerRoundup("Trending Stocks Today")).toBe(true);
    expect(
      isMultiTickerRoundup("Why These 5 Healthcare Stocks Are Rising"),
    ).toBe(true);
  });

  it("returns FALSE for symbol-specific catalyst headlines", () => {
    expect(
      isMultiTickerRoundup("Eli Lilly Wins EMA Approval For Tirzepatide"),
    ).toBe(false);
    expect(
      isMultiTickerRoundup("Eli Lilly Raised To Buy At Morgan Stanley"),
    ).toBe(false);
  });
});

describe("companyNameMatches", () => {
  it("matches when the full core name appears in the headline", () => {
    expect(
      companyNameMatches("Eli Lilly Wins EMA Approval For Tirzepatide", "Eli Lilly, Inc."),
    ).toBe(true);
  });

  it("matches via the last significant token (possessive form)", () => {
    expect(
      companyNameMatches("Lilly's Medicare Win Is Significant", "Eli Lilly, Inc."),
    ).toBe(true);
  });

  it("matches Apple via single-word core", () => {
    expect(
      companyNameMatches("Apple Unveils New AI Features At WWDC", "Apple Inc."),
    ).toBe(true);
  });

  it("returns FALSE when the company name is not present", () => {
    expect(
      companyNameMatches("Apogee Therapeutics Phase 2 Data Positive", "Eli Lilly, Inc."),
    ).toBe(false);
  });

  it("returns false for empty / whitespace inputs", () => {
    expect(companyNameMatches("", "Eli Lilly, Inc.")).toBe(false);
    expect(companyNameMatches("   ", "Eli Lilly, Inc.")).toBe(false);
    expect(companyNameMatches("Eli Lilly Wins EMA Approval", "")).toBe(false);
    expect(companyNameMatches("Eli Lilly Wins EMA Approval", "   ")).toBe(false);
  });
});

describe("isSymbolPrimarySubject", () => {
  const companyName = "Eli Lilly, Inc.";

  it("returns FALSE for a roundup regardless of company name", () => {
    expect(
      isSymbolPrimarySubject(
        "Apogee Therapeutics And 4 Other Stocks Moving Higher Wednesday",
        { companyName },
      ),
    ).toBe(false);
  });

  it("returns FALSE when a different company is the subject", () => {
    expect(
      isSymbolPrimarySubject("Apogee Therapeutics Phase 2 Data Positive", {
        companyName,
      }),
    ).toBe(false);
  });

  it("returns TRUE when the company is the primary subject", () => {
    expect(
      isSymbolPrimarySubject("Eli Lilly Wins EMA Approval For Tirzepatide", {
        companyName,
      }),
    ).toBe(true);
  });

  it("is permissive (returns TRUE) for a non-roundup headline when companyName is unknown", () => {
    expect(
      isSymbolPrimarySubject("Biotech Company X Wins FDA Approval", {
        companyName: null,
      }),
    ).toBe(true);
    expect(
      isSymbolPrimarySubject("Biotech Company X Wins FDA Approval", {
        companyName: undefined,
      }),
    ).toBe(true);
  });

  it("returns FALSE for a roundup even when companyName is null", () => {
    expect(
      isSymbolPrimarySubject("Tech Stocks Moving Lower", { companyName: null }),
    ).toBe(false);
  });
});

describe("headlineMateriality", () => {
  it("returns 3 for regulatory / clinical / M&A headlines", () => {
    expect(
      headlineMateriality("Eli Lilly Wins EMA Approval For Tirzepatide"),
    ).toBe(3);
    expect(
      headlineMateriality("Pfizer Acquires Biotech Firm For $8B"),
    ).toBe(3);
    expect(
      headlineMateriality("FDA Clears New Cancer Therapy"),
    ).toBe(3);
  });

  it("returns 2 for guidance / analyst / earnings / product / policy headlines", () => {
    expect(
      headlineMateriality("Eli Lilly Raised To Buy At Morgan Stanley"),
    ).toBe(2);
    expect(headlineMateriality("Company Raises Full-Year Guidance")).toBe(2);
    expect(headlineMateriality("Q2 Earnings Beat Expectations")).toBe(2);
    expect(headlineMateriality("Medicare To Cover GLP-1 Obesity Drugs")).toBe(2);
  });

  it("returns 1 for a material headline that does not hit a higher bucket", () => {
    // "split" matches CATALYST_KEYWORDS but not tier-3 or tier-2 keywords
    expect(headlineMateriality("Company Announces Stock Split")).toBe(1);
  });

  it("returns 0 for a non-material / noise headline", () => {
    expect(
      headlineMateriality("3 dividend stocks to consider"),
    ).toBe(0);
    expect(
      headlineMateriality("Stocks mixed at midday as traders weigh data"),
    ).toBe(0);
    expect(headlineMateriality("")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task 2: Rank-and-select rewrite — LLY mixed-headline test
// ---------------------------------------------------------------------------

describe("extractCatalystFromNews — Task 2 rank-and-select", () => {
  /** Items newest-first (as Alpaca News returns them):
   *  1. Roundup — should be excluded from selection entirely
   *  2. Analyst raise — material, symbol-primary, materiality 2
   *  3. EMA approval — material, symbol-primary, materiality 3 (highest)
   */
  const LLY_MIXED: CatalystNewsItem[] = [
    {
      headline: "Apogee Therapeutics And 4 Other Stocks Moving Higher Wednesday",
      publisher: "Benzinga",
      url: "https://example.com/roundup",
      publishedAt: "2026-06-27T09:00:00Z",
    },
    {
      headline: "Eli Lilly Raised To Overweight At Morgan Stanley",
      publisher: "Benzinga",
      url: "https://example.com/lly-ms",
      publishedAt: "2026-06-26T14:00:00Z",
    },
    {
      headline: "Eli Lilly Wins EMA Approval For Tirzepatide In Europe",
      publisher: "Reuters",
      url: "https://example.com/lly-ema",
      publishedAt: "2026-06-26T10:00:00Z",
    },
  ];

  it("selects the highest-materiality symbol-primary headline, not the newest", () => {
    const got = extractCatalystFromNews(LLY_MIXED, {
      symbol: "LLY",
      companyName: "Eli Lilly, Inc.",
    });
    // EMA approval is materiality-3; should win over the analyst (materiality-2)
    // even though the analyst headline is newer.
    expect(got.catalyst).toContain("EMA Approval");
    expect(got.catalystType).toBe("product_news");
  });

  it("excludes the roundup from sources", () => {
    const got = extractCatalystFromNews(LLY_MIXED, {
      symbol: "LLY",
      companyName: "Eli Lilly, Inc.",
    });
    const headlines = got.sources.map((s) => s.headline);
    expect(headlines).not.toContain(
      "Apogee Therapeutics And 4 Other Stocks Moving Higher Wednesday",
    );
    // Both symbol-primary material headlines should be in sources
    expect(headlines).toContain("Eli Lilly Wins EMA Approval For Tirzepatide In Europe");
    expect(headlines).toContain("Eli Lilly Raised To Overweight At Morgan Stanley");
  });

  it("returns null catalyst when only material headline is a roundup", () => {
    const roundupOnly: CatalystNewsItem[] = [
      {
        headline: "Apogee Therapeutics And 4 Other Stocks Moving Higher Wednesday",
        publisher: "Benzinga",
        url: "https://example.com/roundup",
        publishedAt: "2026-06-27T09:00:00Z",
      },
    ];
    const got = extractCatalystFromNews(roundupOnly, {
      symbol: "LLY",
      companyName: "Eli Lilly, Inc.",
    });
    expect(got.catalyst).toBeNull();
    expect(got.sources).toEqual([]);
  });
});
