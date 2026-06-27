import { describe, expect, it } from "vitest";
import {
  coerceCashFlow,
  coerceCatalysts,
  coerceDividend,
  coerceDomain,
  coerceEarnings,
  coerceIntLike,
  coerceMoneyLike,
  coerceNumberLike,
  coercePercentLike,
  companyNameFromDescription,
  extractJsonBlock,
  parseStructuredResearch,
} from "./parse";

describe("coerceDomain", () => {
  it("normalizes to a bare host", () => {
    expect(coerceDomain("https://www.apple.com/investor")).toBe("apple.com");
    expect(coerceDomain("Apple.com")).toBe("apple.com");
    expect(coerceDomain("ir.gevernova.com")).toBe("ir.gevernova.com");
  });
  it("returns null for non-domains", () => {
    expect(coerceDomain(null)).toBeNull();
    expect(coerceDomain("n/a")).toBeNull();
    expect(coerceDomain("not a domain")).toBeNull();
  });
});

describe("companyNameFromDescription", () => {
  it("extracts the leading company name before a connector", () => {
    expect(
      companyNameFromDescription("Apple, Inc. engages in the design of phones."),
    ).toBe("Apple, Inc.");
    expect(
      companyNameFromDescription("GE Aerospace is an American aircraft maker."),
    ).toBe("GE Aerospace");
    expect(
      companyNameFromDescription("Microsoft Corporation develops software."),
    ).toBe("Microsoft Corporation");
  });
  it("returns null when no connector or an implausible candidate", () => {
    expect(companyNameFromDescription(null)).toBeNull();
    expect(companyNameFromDescription("No connector here at all")).toBeNull();
    expect(companyNameFromDescription(" is leading")).toBeNull();
  });
});

describe("coerceNumberLike", () => {
  it("accepts plain numbers and numeric strings", () => {
    expect(coerceNumberLike(28.5)).toBe(28.5);
    expect(coerceNumberLike("28.5")).toBe(28.5);
    expect(coerceNumberLike("  11.93 ")).toBe(11.93);
    expect(coerceNumberLike("$11.93")).toBe(11.93);
    expect(coerceNumberLike("1,234.5")).toBe(1234.5);
  });
  it("returns null for unusable values", () => {
    expect(coerceNumberLike(null)).toBeNull();
    expect(coerceNumberLike(undefined)).toBeNull();
    expect(coerceNumberLike("")).toBeNull();
    expect(coerceNumberLike("n/a")).toBeNull();
    expect(coerceNumberLike("—")).toBeNull();
    expect(coerceNumberLike(Number.NaN)).toBeNull();
  });
});

describe("coerceMoneyLike", () => {
  it("expands magnitude suffixes", () => {
    expect(coerceMoneyLike("3.1T")).toBeCloseTo(3.1e12);
    expect(coerceMoneyLike("$3.10 trillion")).toBeCloseTo(3.1e12);
    expect(coerceMoneyLike("245B")).toBeCloseTo(245e9);
    expect(coerceMoneyLike("1.5 million")).toBeCloseTo(1.5e6);
    expect(coerceMoneyLike("900K")).toBeCloseTo(900e3);
    expect(coerceMoneyLike(2_500_000_000)).toBe(2_500_000_000);
  });
  it("returns null when there is no number", () => {
    expect(coerceMoneyLike("unknown")).toBeNull();
    expect(coerceMoneyLike(null)).toBeNull();
  });
});

describe("coercePercentLike", () => {
  it("stores a fraction from a percent string", () => {
    expect(coercePercentLike("0.72%")).toBeCloseTo(0.0072);
    expect(coercePercentLike("1.2%")).toBeCloseTo(0.012);
  });
  it("treats a bare number as a percent value", () => {
    expect(coercePercentLike("0.72")).toBeCloseTo(0.0072);
    expect(coercePercentLike(1.2)).toBeCloseTo(0.012);
  });
  it("returns null for missing yields", () => {
    expect(coercePercentLike(null)).toBeNull();
    expect(coercePercentLike("n/a")).toBeNull();
    expect(coercePercentLike("—")).toBeNull();
  });
});

describe("coerceIntLike", () => {
  it("rounds and strips separators", () => {
    expect(coerceIntLike("164,000")).toBe(164000);
    expect(coerceIntLike(228000)).toBe(228000);
    expect(coerceIntLike("12.9")).toBe(13);
  });
  it("returns null for unusable values", () => {
    expect(coerceIntLike(null)).toBeNull();
    expect(coerceIntLike("lots")).toBeNull();
  });
});

describe("coerceCatalysts", () => {
  it("trims, drops empties/sentinels, dedupes, and caps", () => {
    expect(
      coerceCatalysts(["Q2 earnings Jul 24", "  ", "n/a", "AI capex", "AI capex"]),
    ).toEqual(["Q2 earnings Jul 24", "AI capex"]);
  });
  it("accepts a single string and returns [] for junk", () => {
    expect(coerceCatalysts("Buyback raise")).toEqual(["Buyback raise"]);
    expect(coerceCatalysts(null)).toEqual([]);
    expect(coerceCatalysts(42)).toEqual([]);
  });
  it("caps the count", () => {
    expect(coerceCatalysts(["a", "b", "c", "d"], 2)).toEqual(["a", "b"]);
  });
});

describe("coerceEarnings", () => {
  it("coerces quarters, storing surprise/move as fractions and computing beat", () => {
    const rows = coerceEarnings([
      {
        period: "Q1 FY26",
        epsActual: "1.20",
        epsEstimate: "1.10",
        surprisePct: "+9.1%",
        priceMovePct: "+3.4%",
      },
      {
        period: "Q4 FY25",
        epsActual: 0.9,
        epsEstimate: 1.0,
        priceMovePct: "-2.1%",
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].epsActual).toBeCloseTo(1.2);
    expect(rows[0].surprisePct).toBeCloseTo(0.091);
    expect(rows[0].priceMovePct).toBeCloseTo(0.034);
    expect(rows[0].beat).toBe(true);
    // surprise computed from actual vs estimate when not given; miss → beat false.
    expect(rows[1].surprisePct).toBeCloseTo(-0.1);
    expect(rows[1].priceMovePct).toBeCloseTo(-0.021);
    expect(rows[1].beat).toBe(false);
  });
  it("keeps only the most recent N and skips junk rows", () => {
    const rows = coerceEarnings(
      [
        { period: "Q1", epsActual: 1 },
        {},
        { period: "Q2", epsActual: 2 },
        { period: "Q3", epsActual: 3 },
      ],
      2,
    );
    expect(rows.map((r) => r.period)).toEqual(["Q2", "Q3"]);
  });
  it("returns [] for a non-array", () => {
    expect(coerceEarnings(null)).toEqual([]);
    expect(coerceEarnings("nope")).toEqual([]);
  });
});

describe("extractJsonBlock", () => {
  it("pulls a fenced json block out and returns the cleaned prose", () => {
    const text =
      'Azure is re-accelerating.\n\n```json\n{"profile": {"ceo": "Satya Nadella"}}\n```\n';
    const { json, cleaned } = extractJsonBlock(text);
    expect(json).toEqual({ profile: { ceo: "Satya Nadella" } });
    expect(cleaned).toBe("Azure is re-accelerating.");
    expect(cleaned).not.toContain("{");
  });

  it("returns null json and the original text when there is no block", () => {
    const text = "Just prose, no JSON here.";
    const { json, cleaned } = extractJsonBlock(text);
    expect(json).toBeNull();
    expect(cleaned).toBe(text);
  });

  it("falls back to a trailing bare object when unfenced", () => {
    const text = 'Summary line.\n{"fundamentals": {"peRatio": 28.5}}';
    const { json, cleaned } = extractJsonBlock(text);
    expect(json).toEqual({ fundamentals: { peRatio: 28.5 } });
    expect(cleaned).toBe("Summary line.");
  });
});

describe("coerceCashFlow", () => {
  it("coerces a full cash-flow block, expanding money suffixes + percent yields", () => {
    const cf = coerceCashFlow({
      operatingCashFlow: "1.5B",
      freeCashFlow: "1.2B",
      fcfTrend: "Growing",
      fcfYield: "4.1%",
      netDebt: "-500M",
      debtToEquity: "0.3",
      interestCoverage: "20",
    });
    expect(cf).not.toBeNull();
    expect(cf!.operatingCashFlow).toBeCloseTo(1.5e9);
    expect(cf!.freeCashFlow).toBeCloseTo(1.2e9);
    expect(cf!.fcfTrend).toBe("growing");
    expect(cf!.fcfYield).toBeCloseTo(0.041);
    expect(cf!.netDebt).toBeCloseTo(-5e8);
    expect(cf!.debtToEquity).toBeCloseTo(0.3);
    expect(cf!.interestCoverage).toBeCloseTo(20);
  });

  it("derives FCF yield from FCF ÷ market cap when the yield is absent", () => {
    const cf = coerceCashFlow(
      { freeCashFlow: "2B", fcfTrend: "stable" },
      { marketCap: 50e9 },
    );
    expect(cf!.fcfYield).toBeCloseTo(0.04);
  });

  it("does not fabricate a yield without a market cap", () => {
    const cf = coerceCashFlow({ freeCashFlow: "2B" });
    expect(cf!.fcfYield).toBeNull();
  });

  it("maps trend synonyms and nulls an unknown trend", () => {
    expect(coerceCashFlow({ fcfTrend: "rising" })!.fcfTrend).toBe("growing");
    expect(coerceCashFlow({ fcfTrend: "deteriorating" })!.fcfTrend).toBe(
      "declining",
    );
    expect(coerceCashFlow({ fcfTrend: "flat" })!.fcfTrend).toBe("stable");
    // An unknown trend nulls (with another usable field keeping the block live).
    expect(
      coerceCashFlow({ freeCashFlow: "1B", fcfTrend: "sideways??" })!.fcfTrend,
    ).toBeNull();
  });

  it("returns null for a non-object or an all-null/empty block", () => {
    expect(coerceCashFlow(null)).toBeNull();
    expect(coerceCashFlow("nope")).toBeNull();
    expect(
      coerceCashFlow({ freeCashFlow: "n/a", fcfTrend: "unknown" }),
    ).toBeNull();
  });
});

describe("coerceDividend", () => {
  it("coerces a full dividend block, reading percent fields as fractions", () => {
    const d = coerceDividend({
      dividendYield: "3.1%",
      payoutRatio: "45%",
      fcfPayout: "42%",
      fcfCoverage: 2.4,
      growthStreakYears: 14,
      dividendCagr: "11%",
    });
    expect(d).not.toBeNull();
    expect(d!.dividendYield).toBeCloseTo(0.031);
    expect(d!.payoutRatio).toBeCloseTo(0.45);
    expect(d!.fcfPayout).toBeCloseTo(0.42);
    expect(d!.fcfCoverage).toBeCloseTo(2.4);
    expect(d!.growthStreakYears).toBe(14);
    expect(d!.dividendCagr).toBeCloseTo(0.11);
  });

  it("derives FCF coverage from FCF payout when coverage is absent", () => {
    const d = coerceDividend({ dividendYield: "3%", fcfPayout: "40%" });
    expect(d!.fcfCoverage).toBeCloseTo(2.5); // 1 / 0.40
  });

  it("derives FCF payout from coverage when payout is absent", () => {
    const d = coerceDividend({ dividendYield: "3%", fcfCoverage: 4 });
    expect(d!.fcfPayout).toBeCloseTo(0.25); // 1 / 4
  });

  it("falls back to the fundamentals dividend yield when the block omits it", () => {
    const d = coerceDividend(
      { fcfCoverage: 2 },
      { dividendYield: 0.027 },
    );
    expect(d!.dividendYield).toBeCloseTo(0.027);
  });

  it("returns null for a non-object or an all-null/empty block", () => {
    expect(coerceDividend(null)).toBeNull();
    expect(coerceDividend({ dividendYield: "n/a", payoutRatio: "unknown" })).toBeNull();
  });
});

describe("parseStructuredResearch", () => {
  it("coerces a full structured block into profile/fundamentals/consensus", () => {
    const text = [
      "Strong quarter; Azure re-accelerating.",
      "```json",
      JSON.stringify({
        profile: {
          ceo: "Satya Nadella",
          employees: "228,000",
          sector: "Technology",
          industry: "Software—Infrastructure",
          country: "United States",
          exchange: "NASDAQ",
          ipoDate: "1986-03-13",
          description: "Microsoft develops software and cloud services.",
        },
        fundamentals: {
          marketCap: "3.1T",
          peRatio: 36.2,
          eps: "11.93",
          dividendYield: "0.72%",
        },
        consensus: {
          rating: "Strong Buy",
          targetMean: 520,
          targetHigh: 600,
          targetLow: 440,
          analystCount: "41",
        },
      }),
      "```",
    ].join("\n");

    const { profile, fundamentals, consensus, summary } =
      parseStructuredResearch(text);

    expect(summary).toBe("Strong quarter; Azure re-accelerating.");
    expect(profile).toEqual({
      name: null,
      domain: null,
      ceo: "Satya Nadella",
      employees: 228000,
      sector: "Technology",
      industry: "Software—Infrastructure",
      country: "United States",
      exchange: "NASDAQ",
      ipoDate: "1986-03-13",
      description: "Microsoft develops software and cloud services.",
    });
    expect(fundamentals!.marketCap).toBeCloseTo(3.1e12);
    expect(fundamentals!.peRatio).toBeCloseTo(36.2);
    expect(fundamentals!.eps).toBeCloseTo(11.93);
    expect(fundamentals!.dividendYield).toBeCloseTo(0.0072);
    expect(consensus).toEqual({
      rating: "Strong Buy",
      targetMean: 520,
      targetHigh: 600,
      targetLow: 440,
      analystCount: 41,
    });
  });

  it("lifts the earnings strip and catalyst chips out of the block", () => {
    const text = [
      "Beat-and-raise quarter.",
      "```json",
      JSON.stringify({
        earnings: [
          { period: "Q4 FY25", epsActual: 0.95, epsEstimate: 1.0 },
          {
            period: "Q1 FY26",
            epsActual: 1.2,
            epsEstimate: 1.1,
            priceMovePct: "+3.4%",
          },
        ],
        catalysts: ["Q2 earnings Jul 24", "Data-center capex cycle"],
      }),
      "```",
    ].join("\n");

    const { earnings, catalysts, summary } = parseStructuredResearch(text);
    expect(summary).toBe("Beat-and-raise quarter.");
    expect(earnings).toHaveLength(2);
    expect(earnings[1].beat).toBe(true);
    expect(earnings[1].priceMovePct).toBeCloseTo(0.034);
    expect(catalysts).toEqual(["Q2 earnings Jul 24", "Data-center capex cycle"]);
  });

  it("lifts the cash-flow block and derives FCF yield from the block's market cap", () => {
    const text = [
      "Durable cash generation despite the de-rating.",
      "```json",
      JSON.stringify({
        fundamentals: { marketCap: "40B" },
        cashFlow: {
          operatingCashFlow: "2.4B",
          freeCashFlow: "2B",
          fcfTrend: "stable",
          netDebt: "1B",
          debtToEquity: 0.8,
          interestCoverage: 12,
        },
      }),
      "```",
    ].join("\n");

    const { cashFlow } = parseStructuredResearch(text);
    expect(cashFlow).not.toBeNull();
    expect(cashFlow!.freeCashFlow).toBeCloseTo(2e9);
    expect(cashFlow!.fcfTrend).toBe("stable");
    // 2B FCF ÷ 40B market cap = 5%.
    expect(cashFlow!.fcfYield).toBeCloseTo(0.05);
  });

  it("returns nulls/empties (never throws) when there is no JSON block", () => {
    const {
      profile,
      fundamentals,
      consensus,
      earnings,
      catalysts,
      cashFlow,
      dividend,
      summary,
    } = parseStructuredResearch("Only prose here.");
    expect(profile).toBeNull();
    expect(fundamentals).toBeNull();
    expect(consensus).toBeNull();
    expect(earnings).toEqual([]);
    expect(catalysts).toEqual([]);
    expect(cashFlow).toBeNull();
    expect(dividend).toBeNull();
    expect(summary).toBe("Only prose here.");
  });

  it("lifts the dividend block, falling back to the fundamentals yield", () => {
    const text = [
      "Aristocrat compounder; payout well covered.",
      "```json",
      JSON.stringify({
        fundamentals: { dividendYield: "3.0%" },
        dividend: {
          payoutRatio: "45%",
          fcfPayout: "40%",
          growthStreakYears: 14,
        },
      }),
      "```",
    ].join("\n");
    const { dividend } = parseStructuredResearch(text);
    expect(dividend).not.toBeNull();
    // Yield filled from fundamentals; coverage derived from FCF payout (1/0.40).
    expect(dividend!.dividendYield).toBeCloseTo(0.03);
    expect(dividend!.fcfCoverage).toBeCloseTo(2.5);
    expect(dividend!.growthStreakYears).toBe(14);
  });

  it("keeps partial fields and nulls the unknown ones", () => {
    const text =
      'Mixed.\n```json\n{"fundamentals":{"marketCap":"unknown","peRatio":null,"eps":"4.10","dividendYield":null}}\n```';
    const { fundamentals } = parseStructuredResearch(text);
    expect(fundamentals).not.toBeNull();
    expect(fundamentals!.marketCap).toBeNull();
    expect(fundamentals!.peRatio).toBeNull();
    expect(fundamentals!.eps).toBeCloseTo(4.1);
    expect(fundamentals!.dividendYield).toBeNull();
  });

  it("survives malformed JSON without throwing", () => {
    const text = "Prose.\n```json\n{not valid json}\n```";
    const { profile, fundamentals, consensus, summary } =
      parseStructuredResearch(text);
    expect(profile).toBeNull();
    expect(fundamentals).toBeNull();
    expect(consensus).toBeNull();
    // The unparseable block is still stripped from the prose.
    expect(summary).toContain("Prose.");
  });

  describe("jsonStatus (truncation detection, research-output-completes M1)", () => {
    it("reports ok when a complete JSON block parses", () => {
      const text =
        '```json\n{"profile":{"name":"Eli Lilly"},"cashFlow":{"freeCashFlow":"8B"}}\n```\nShort prose.';
      expect(parseStructuredResearch(text).jsonStatus).toBe("ok");
    });

    it("reports missing when there is no JSON block at all", () => {
      expect(parseStructuredResearch("Only prose here.").jsonStatus).toBe(
        "missing",
      );
    });

    it("reports parse-error when a fenced block was opened but is unterminated (truncated)", () => {
      // The real LLY failure: max_output_tokens cut the JSON mid-stream at the
      // consensus block — fence opened, never closed, outer object never closed.
      const truncated =
        '```json\n{"profile":{"name":"Eli Lilly, Co."},"fundamentals":{"marketCap":"1.14T","peRatio":41.01},"cons';
      const result = parseStructuredResearch(truncated);
      expect(result.jsonStatus).toBe("parse-error");
      // And nothing was salvaged — the value fields stay null.
      expect(result.cashFlow).toBeNull();
      expect(result.dividend).toBeNull();
    });

    it("reports parse-error for a bare (unfenced) object that begins with our keys but is truncated", () => {
      const truncated = '{"profile":{"name":"X"},"fundamentals":{"marketCap":"1';
      expect(parseStructuredResearch(truncated).jsonStatus).toBe("parse-error");
    });

    it("reports parse-error for a malformed but fully-fenced block", () => {
      expect(
        parseStructuredResearch("Prose.\n```json\n{not valid json}\n```").jsonStatus,
      ).toBe("parse-error");
    });
  });
});
