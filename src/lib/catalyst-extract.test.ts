import { describe, expect, it } from "vitest";
import {
  classifyCatalyst,
  extractCatalyst,
  isCompanyDescription,
} from "@/lib/catalyst-extract";

const JKHY_DESC =
  "Jack Henry & Associates provides technology solutions to banks and credit unions. The company operates in Technology (Information Technology Services).";

describe("isCompanyDescription", () => {
  it("flags company-profile boilerplate", () => {
    expect(isCompanyDescription(JKHY_DESC)).toBe(true);
    expect(
      isCompanyDescription("Apple Inc. designs and manufactures consumer electronics."),
    ).toBe(true);
    expect(isCompanyDescription("GE Aerospace is an American aircraft-engine maker.")).toBe(true);
  });

  it("does NOT flag a real why-now catalyst phrase", () => {
    expect(isCompanyDescription("Q2 earnings beat, raised FY guidance")).toBe(false);
    expect(isCompanyDescription("Dividend hike + insider buying")).toBe(false);
    expect(isCompanyDescription("Oversold RSI bounce off long-term support")).toBe(false);
  });
});

describe("classifyCatalyst", () => {
  it("maps phrases to a specific type where it can, else 'other'", () => {
    expect(classifyCatalyst("Q2 earnings beat-and-raise")).toBe("earnings_momentum");
    expect(classifyCatalyst("Raised FY26 guidance")).toBe("guidance");
    expect(classifyCatalyst("New product launch next week")).toBe("product_news");
    expect(classifyCatalyst("Sector rotation into staples")).toBe("sector_rotation");
    // A genuine why-now with no enum bucket stays a (passing) 'other', not 'none'.
    expect(classifyCatalyst("Dividend hike + insider buying")).toBe("other");
  });
});

describe("extractCatalyst", () => {
  it("returns a real catalyst phrase + its classified type", () => {
    const r = extractCatalyst(["Q2 earnings Jul 24", "data-center capex cycle"]);
    expect(r).not.toBeNull();
    expect(r!.catalyst).toBe("Q2 earnings Jul 24");
    expect(r!.catalystType).toBe("earnings_momentum");
  });

  it("skips a company-description blurb and picks the first REAL catalyst", () => {
    const r = extractCatalyst([JKHY_DESC, "Raised FY guidance"]);
    expect(r!.catalyst).toBe("Raised FY guidance");
    expect(r!.catalystType).toBe("guidance");
  });

  it("returns null when there's only a description / nothing usable", () => {
    expect(extractCatalyst([JKHY_DESC])).toBeNull(); // a description is NOT a catalyst
    expect(extractCatalyst([])).toBeNull();
    expect(extractCatalyst(undefined)).toBeNull();
    expect(extractCatalyst(["", "   "])).toBeNull();
  });

  it("word-truncates an over-long catalyst phrase (never mid-word)", () => {
    const long =
      "Q2 earnings beat with raised full-year guidance and a newly announced accelerated share-repurchase authorization running through the next several quarters of the fiscal year ahead";
    const r = extractCatalyst([long]);
    expect(r!.catalyst.endsWith("…")).toBe(true);
    // The body must be a clean word-boundary prefix of the original — never a
    // mid-word cut. The char after the truncation point in the source is a space.
    const body = r!.catalyst.slice(0, -1);
    expect(long.startsWith(body)).toBe(true);
    expect(long[body.length]).toBe(" ");
  });
});
