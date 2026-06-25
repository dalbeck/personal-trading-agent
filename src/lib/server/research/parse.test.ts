import { describe, expect, it } from "vitest";
import {
  coerceIntLike,
  coerceMoneyLike,
  coerceNumberLike,
  coercePercentLike,
  extractJsonBlock,
  parseStructuredResearch,
} from "./parse";

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

  it("returns nulls (never throws) when there is no JSON block", () => {
    const { profile, fundamentals, consensus, summary } =
      parseStructuredResearch("Only prose here.");
    expect(profile).toBeNull();
    expect(fundamentals).toBeNull();
    expect(consensus).toBeNull();
    expect(summary).toBe("Only prose here.");
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
});
