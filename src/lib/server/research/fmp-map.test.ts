/**
 * Unit tests for FMP v3 response → research shape mappers.
 * No network, no side effects — pure function coverage.
 */

import { describe, expect, it } from "vitest";
import {
  dividendStreakAndCagr,
  fcfTrendFromRows,
  mapFmpToResearch,
} from "./fmp-map";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fullProfile = [
  {
    mktCap: 3_000_000_000_000,
    companyName: "Apple Inc.",
    website: "https://www.apple.com/investor-relations",
    ceo: "Tim Cook",
    sector: "Technology",
    industry: "Consumer Electronics",
    country: "US",
    exchangeShortName: "NASDAQ",
    ipoDate: "1980-12-12",
    fullTimeEmployees: 164000,
    description: "Apple Inc. designs, manufactures and markets consumer electronics.",
  },
];

const fullRatiosTtm = [
  {
    peRatioTTM: 32.5,
    dividendYieldTTM: 0.0044, // fraction
    payoutRatioTTM: 0.142,   // fraction
    debtEquityRatioTTM: 1.87,
    interestCoverageTTM: 28.3,
  },
];

const fullKeyMetricsTtm = [
  {
    marketCapTTM: 3_100_000_000_000,
    freeCashFlowYieldTTM: 0.038, // fraction
    netIncomePerShareTTM: 6.57,
  },
];

const fullCashFlow = [
  {
    operatingCashFlow: 118_254_000_000,
    freeCashFlow: 99_584_000_000,
    dividendsPaid: -15_025_000_000, // negative
  },
  {
    operatingCashFlow: 110_000_000_000,
    freeCashFlow: 90_000_000_000,
    dividendsPaid: -14_000_000_000,
  },
  {
    operatingCashFlow: 100_000_000_000,
    freeCashFlow: 80_000_000_000,
    dividendsPaid: -13_000_000_000,
  },
];

const fullDividendHistory = {
  historical: [
    { date: "2023-11-10", dividend: 0.24 },
    { date: "2023-08-11", dividend: 0.24 },
    { date: "2023-05-12", dividend: 0.24 },
    { date: "2023-02-10", dividend: 0.23 },
    { date: "2022-11-04", dividend: 0.23 },
    { date: "2022-08-05", dividend: 0.23 },
    { date: "2022-05-06", dividend: 0.23 },
    { date: "2022-02-04", dividend: 0.22 },
    { date: "2021-11-05", dividend: 0.22 },
    { date: "2021-08-06", dividend: 0.22 },
    { date: "2021-05-07", dividend: 0.22 },
    { date: "2021-02-05", dividend: 0.205 },
    { date: "2020-11-06", dividend: 0.205 },
    { date: "2020-08-07", dividend: 0.205 },
    { date: "2020-05-08", dividend: 0.205 },
    { date: "2020-02-07", dividend: 0.1925 },
    { date: "2019-11-07", dividend: 0.1925 },
    { date: "2019-08-08", dividend: 0.1925 },
    { date: "2019-05-10", dividend: 0.1925 },
    { date: "2019-02-08", dividend: 0.1820 },
  ],
};

const fullRaw = {
  profile: fullProfile,
  ratiosTtm: fullRatiosTtm,
  keyMetricsTtm: fullKeyMetricsTtm,
  cashFlow: fullCashFlow,
  dividendHistory: fullDividendHistory,
};

// ---------------------------------------------------------------------------
// mapFmpToResearch — full set
// ---------------------------------------------------------------------------

describe("mapFmpToResearch — full set", () => {
  const result = mapFmpToResearch(fullRaw);

  it("maps mktCap to fundamentals.marketCap", () => {
    expect(result.fundamentals?.marketCap).toBe(3_000_000_000_000);
  });

  it("maps peRatioTTM to fundamentals.peRatio", () => {
    expect(result.fundamentals?.peRatio).toBeCloseTo(32.5);
  });

  it("maps netIncomePerShareTTM to fundamentals.eps", () => {
    expect(result.fundamentals?.eps).toBeCloseTo(6.57);
  });

  it("maps dividendYieldTTM (fraction) to fundamentals.dividendYield WITHOUT dividing by 100", () => {
    // 0.0044 stays 0.0044 — NOT 0.000044
    expect(result.fundamentals?.dividendYield).toBeCloseTo(0.0044);
  });

  it("maps dividendYieldTTM (fraction) to dividend.dividendYield", () => {
    expect(result.dividend?.dividendYield).toBeCloseTo(0.0044);
  });

  it("maps payoutRatioTTM (fraction) to dividend.payoutRatio", () => {
    expect(result.dividend?.payoutRatio).toBeCloseTo(0.142);
  });

  it("maps debtEquityRatioTTM to cashFlow.debtToEquity", () => {
    expect(result.cashFlow?.debtToEquity).toBeCloseTo(1.87);
  });

  it("maps interestCoverageTTM to cashFlow.interestCoverage", () => {
    expect(result.cashFlow?.interestCoverage).toBeCloseTo(28.3);
  });

  it("maps freeCashFlowYieldTTM (fraction) to cashFlow.fcfYield WITHOUT dividing by 100", () => {
    expect(result.cashFlow?.fcfYield).toBeCloseTo(0.038);
  });

  it("maps cashFlow[0].operatingCashFlow to cashFlow.operatingCashFlow", () => {
    expect(result.cashFlow?.operatingCashFlow).toBe(118_254_000_000);
  });

  it("maps cashFlow[0].freeCashFlow to cashFlow.freeCashFlow", () => {
    expect(result.cashFlow?.freeCashFlow).toBe(99_584_000_000);
  });

  it("derives dividend.fcfPayout from abs(dividendsPaid)/freeCashFlow", () => {
    // abs(-15_025_000_000) / 99_584_000_000 ≈ 0.1509
    const expected = 15_025_000_000 / 99_584_000_000;
    expect(result.dividend?.fcfPayout).toBeCloseTo(expected, 4);
  });

  it("derives dividend.fcfCoverage from freeCashFlow/abs(dividendsPaid)", () => {
    const expected = 99_584_000_000 / 15_025_000_000;
    expect(result.dividend?.fcfCoverage).toBeCloseTo(expected, 4);
  });

  it("sets cashFlow.netDebt to null (not populated in M2)", () => {
    expect(result.cashFlow?.netDebt).toBeNull();
  });

  it("sets fcfTrend based on rows (growing: latest > prior * 1.05)", () => {
    // 99_584 > 90_000 * 1.05 = 94_500 → growing
    expect(result.cashFlow?.fcfTrend).toBe("growing");
  });
});

// ---------------------------------------------------------------------------
// mapFmpToResearch — profile mapping
// ---------------------------------------------------------------------------

describe("mapFmpToResearch — profile", () => {
  const result = mapFmpToResearch(fullRaw);

  it("maps companyName to profile.name", () => {
    expect(result.profile?.name).toBe("Apple Inc.");
  });

  it("maps website to profile.domain as HOST ONLY (no protocol, no path)", () => {
    expect(result.profile?.domain).toBe("apple.com");
  });

  it("maps ceo", () => {
    expect(result.profile?.ceo).toBe("Tim Cook");
  });

  it("maps sector", () => {
    expect(result.profile?.sector).toBe("Technology");
  });

  it("maps industry", () => {
    expect(result.profile?.industry).toBe("Consumer Electronics");
  });

  it("maps country", () => {
    expect(result.profile?.country).toBe("US");
  });

  it("maps exchangeShortName to profile.exchange", () => {
    expect(result.profile?.exchange).toBe("NASDAQ");
  });

  it("maps ipoDate", () => {
    expect(result.profile?.ipoDate).toBe("1980-12-12");
  });

  it("maps fullTimeEmployees to profile.employees as integer", () => {
    expect(result.profile?.employees).toBe(164000);
  });

  it("maps description", () => {
    expect(result.profile?.description).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// mapFmpToResearch — marketCapTTM fallback
// ---------------------------------------------------------------------------

describe("mapFmpToResearch — marketCapTTM fallback", () => {
  it("falls back to marketCapTTM when profile mktCap is null", () => {
    const raw = {
      profile: [{ mktCap: null, companyName: "Test Co" }],
      keyMetricsTtm: [{ marketCapTTM: 999_000_000_000 }],
    };
    const result = mapFmpToResearch(raw);
    expect(result.fundamentals?.marketCap).toBe(999_000_000_000);
  });
});

// ---------------------------------------------------------------------------
// mapFmpToResearch — all-empty input → all null, never throws
// ---------------------------------------------------------------------------

describe("mapFmpToResearch — all-empty input", () => {
  it("returns all four groups null for empty FmpRaw", () => {
    const result = mapFmpToResearch({});
    expect(result.fundamentals).toBeNull();
    expect(result.profile).toBeNull();
    expect(result.cashFlow).toBeNull();
    expect(result.dividend).toBeNull();
  });

  it("does not throw on empty input", () => {
    expect(() => mapFmpToResearch({})).not.toThrow();
  });

  it("does not throw on undefined fields", () => {
    expect(() =>
      mapFmpToResearch({
        profile: undefined,
        ratiosTtm: undefined,
        keyMetricsTtm: undefined,
        cashFlow: undefined,
        dividendHistory: undefined,
      }),
    ).not.toThrow();
  });

  it("does not throw on non-array input shapes", () => {
    expect(() =>
      mapFmpToResearch({
        profile: "bad",
        ratiosTtm: 42,
        cashFlow: null,
      }),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// fcfTrendFromRows
// ---------------------------------------------------------------------------

describe("fcfTrendFromRows", () => {
  it("returns 'growing' when latest > prior * 1.05", () => {
    const rows = [
      { freeCashFlow: 110 }, // latest
      { freeCashFlow: 100 }, // prior (110 > 100*1.05=105 → growing)
    ];
    expect(fcfTrendFromRows(rows)).toBe("growing");
  });

  it("returns 'declining' when latest < prior * 0.95", () => {
    const rows = [
      { freeCashFlow: 90 },  // latest
      { freeCashFlow: 100 }, // prior (90 < 100*0.95=95 → declining)
    ];
    expect(fcfTrendFromRows(rows)).toBe("declining");
  });

  it("returns 'stable' when within ±5%", () => {
    const rows = [
      { freeCashFlow: 102 },
      { freeCashFlow: 100 },
    ];
    expect(fcfTrendFromRows(rows)).toBe("stable");
  });

  it("returns null with fewer than 2 valid rows", () => {
    expect(fcfTrendFromRows([{ freeCashFlow: 100 }])).toBeNull();
  });

  it("returns null with empty array", () => {
    expect(fcfTrendFromRows([])).toBeNull();
  });

  it("returns null for non-array input", () => {
    expect(fcfTrendFromRows(null)).toBeNull();
    expect(fcfTrendFromRows(undefined)).toBeNull();
    expect(fcfTrendFromRows("bad")).toBeNull();
  });

  it("returns null when freeCashFlow is not finite (e.g. null rows)", () => {
    const rows = [
      { freeCashFlow: null },
      { freeCashFlow: 100 },
    ];
    expect(fcfTrendFromRows(rows)).toBeNull();
  });

  it("handles exactly 2 rows at the boundary (exactly 5% up → stable)", () => {
    const rows = [
      { freeCashFlow: 105 },
      { freeCashFlow: 100 },
    ];
    // 105 is NOT > 105 (105 === 100*1.05), so NOT growing → stable
    expect(fcfTrendFromRows(rows)).toBe("stable");
  });
});

// ---------------------------------------------------------------------------
// dividendStreakAndCagr
// ---------------------------------------------------------------------------

describe("dividendStreakAndCagr — 5-year rising history", () => {
  // fullDividendHistory has data from 2019-2023 (5 calendar years worth of data)
  // Annual totals (approx):
  //   2023: 0.24*3 + 0.23 = 0.95
  //   2022: 0.23*3 + 0.22 = 0.91
  //   2021: 0.22*3 + 0.205 = 0.865
  //   2020: 0.205*3 + 0.1925 = 0.8075
  //   2019: 0.1925*3 + 0.182 = 0.7595
  // All years increase from prior → streak should be ≥ 4

  it("returns a positive growthStreakYears for rising annual dividends", () => {
    const result = dividendStreakAndCagr(fullDividendHistory);
    expect(result.growthStreakYears).not.toBeNull();
    expect(result.growthStreakYears!).toBeGreaterThanOrEqual(4);
  });

  it("returns a positive dividendCagr for rising annual dividends", () => {
    const result = dividendStreakAndCagr(fullDividendHistory);
    expect(result.dividendCagr).not.toBeNull();
    expect(result.dividendCagr!).toBeGreaterThan(0);
  });
});

describe("dividendStreakAndCagr — empty / 1-entry history", () => {
  it("returns both null for empty historical array", () => {
    const result = dividendStreakAndCagr({ historical: [] });
    expect(result.growthStreakYears).toBeNull();
    expect(result.dividendCagr).toBeNull();
  });

  it("returns both null for 1-entry historical array (only 1 year)", () => {
    const result = dividendStreakAndCagr({
      historical: [{ date: "2023-05-10", dividend: 0.25 }],
    });
    expect(result.growthStreakYears).toBeNull();
    expect(result.dividendCagr).toBeNull();
  });

  it("returns both null for null/undefined input", () => {
    expect(dividendStreakAndCagr(null)).toEqual({
      growthStreakYears: null,
      dividendCagr: null,
    });
    expect(dividendStreakAndCagr(undefined)).toEqual({
      growthStreakYears: null,
      dividendCagr: null,
    });
  });

  it("returns both null for bad shape (no historical)", () => {
    expect(dividendStreakAndCagr({ notHistorical: [] })).toEqual({
      growthStreakYears: null,
      dividendCagr: null,
    });
  });

  it("returns both null for exactly 2 entries both in same year", () => {
    const result = dividendStreakAndCagr({
      historical: [
        { date: "2023-11-10", dividend: 0.25 },
        { date: "2023-05-10", dividend: 0.24 },
      ],
    });
    // Only 1 full year → both null
    expect(result.growthStreakYears).toBeNull();
    expect(result.dividendCagr).toBeNull();
  });
});
