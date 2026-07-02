import { describe, expect, it } from "vitest";
import {
  DIVIDEND_THRESHOLDS,
  assessDividendFloor,
  hasDividendData,
} from "@/lib/dividend";
import type { DividendSignals } from "@/lib/types";

const EMPTY: DividendSignals = {
  dividendYield: null,
  payoutRatio: null,
  fcfPayout: null,
  fcfCoverage: null,
  growthStreakYears: null,
  dividendCagr: null,
};

/** A durable, well-covered dividend: FCF covers 2.4×, 14-yr growth streak. */
const DURABLE: DividendSignals = {
  dividendYield: 0.031,
  payoutRatio: 0.45,
  fcfPayout: 1 / 2.4,
  fcfCoverage: 2.4,
  growthStreakYears: 14,
  dividendCagr: 0.11,
};

describe("hasDividendData", () => {
  it("is false for null / an all-null block", () => {
    expect(hasDividendData(null)).toBe(false);
    expect(hasDividendData(EMPTY)).toBe(false);
  });
  it("is true when any field is present", () => {
    expect(hasDividendData({ ...EMPTY, dividendYield: 0.03 })).toBe(true);
  });
});

describe("assessDividendFloor", () => {
  it("returns na with no data (never a false floor)", () => {
    const r = assessDividendFloor(null);
    expect(r.status).toBe("na");
    expect(r.covered).toBe(false);
    expect(r.floorText).toBeNull();
  });

  it("flags a dividend that was CUT (negative CAGR) as at-risk, even if covered", () => {
    // A shrinking dividend is a value-trap tell — a cut overrides a clean cover.
    const r = assessDividendFloor({ ...DURABLE, dividendCagr: -0.15 });
    expect(r.status).toBe("flag");
    expect(r.atRisk).toBe(true);
    expect(r.covered).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/cut/i);
  });

  it("registers a named floor for a durable, well-covered dividend", () => {
    const r = assessDividendFloor(DURABLE);
    expect(r.status).toBe("pass");
    expect(r.covered).toBe(true);
    expect(r.atRisk).toBe(false);
    // The concrete floor string the spec asks for.
    expect(r.floorText).toBe(
      "Dividend floor: FCF covers 2.4×, 14-yr growth streak",
    );
  });

  it("derives coverage from FCF payout when coverage isn't given directly", () => {
    const r = assessDividendFloor({
      ...EMPTY,
      dividendYield: 0.03,
      fcfPayout: 0.4, // → 2.5× coverage
      growthStreakYears: 10,
    });
    expect(r.status).toBe("pass");
    expect(r.floorText).toMatch(/covers 2\.5×/);
  });

  it("falls back to CAGR in the floor text when there's no growth streak", () => {
    const r = assessDividendFloor({
      ...EMPTY,
      dividendYield: 0.03,
      fcfCoverage: 2.0,
      dividendCagr: 0.08,
    });
    expect(r.status).toBe("pass");
    expect(r.floorText).toMatch(/covers 2\.0×/);
    expect(r.floorText).toMatch(/8\.00% CAGR/);
  });

  it("flags an uncovered dividend (FCF doesn't cover it) as a value-trap, not a floor", () => {
    const r = assessDividendFloor({
      ...EMPTY,
      dividendYield: 0.06,
      fcfCoverage: 0.7,
    });
    expect(r.status).toBe("flag");
    expect(r.atRisk).toBe(true);
    expect(r.covered).toBe(false);
    expect(r.floorText).toBeNull();
    expect(r.reasons.join(" ")).toMatch(/cover/i);
  });

  it("flags a stretched payout ratio (>100% of earnings)", () => {
    const r = assessDividendFloor({
      ...EMPTY,
      dividendYield: 0.05,
      payoutRatio: DIVIDEND_THRESHOLDS.payoutRatioStretched + 0.2,
    });
    expect(r.status).toBe("flag");
    expect(r.atRisk).toBe(true);
  });

  it("stays na for a dividend whose coverage is unknown/middling (not a floor, not at-risk)", () => {
    const r = assessDividendFloor({
      ...EMPTY,
      dividendYield: 0.03,
      fcfCoverage: 1.05, // covered but not comfortably (< healthy 1.2)
    });
    expect(r.status).toBe("na");
    expect(r.covered).toBe(false);
    expect(r.atRisk).toBe(false);
    expect(r.floorText).toBeNull();
  });

  it("returns na when there is no dividend at all (yield 0 / absent)", () => {
    const r = assessDividendFloor({ ...EMPTY, payoutRatio: 0 });
    expect(r.status).toBe("na");
    expect(r.floorText).toBeNull();
  });
});
