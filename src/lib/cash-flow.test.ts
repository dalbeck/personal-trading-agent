import { describe, expect, it } from "vitest";
import {
  CASH_FLOW_THRESHOLDS,
  assessCashFlowQuality,
  cashFlowTrendLabel,
  hasCashFlowData,
  isFinancialSector,
} from "@/lib/cash-flow";
import type { CashFlowQuality } from "@/lib/types";

/** A fully-null block — research came back with nothing usable. */
const EMPTY: CashFlowQuality = {
  operatingCashFlow: null,
  freeCashFlow: null,
  fcfTrend: null,
  fcfYield: null,
  netDebt: null,
  debtToEquity: null,
  interestCoverage: null,
};

/** A clean floor: positive growing FCF, healthy yield, light leverage. */
const STRONG: CashFlowQuality = {
  operatingCashFlow: 1_500_000_000,
  freeCashFlow: 1_200_000_000,
  fcfTrend: "growing",
  fcfYield: 0.045,
  netDebt: -500_000_000, // net cash
  debtToEquity: 0.3,
  interestCoverage: 20,
};

describe("hasCashFlowData", () => {
  it("is false for null and an all-null block", () => {
    expect(hasCashFlowData(null)).toBe(false);
    expect(hasCashFlowData(EMPTY)).toBe(false);
  });

  it("is true when any field is present", () => {
    expect(hasCashFlowData({ ...EMPTY, freeCashFlow: 1 })).toBe(true);
    expect(hasCashFlowData({ ...EMPTY, fcfTrend: "stable" })).toBe(true);
  });
});

describe("assessCashFlowQuality", () => {
  it("returns na (never a false pass) with no data", () => {
    expect(assessCashFlowQuality(null).status).toBe("na");
    expect(assessCashFlowQuality(EMPTY).status).toBe("na");
  });

  it("passes a clean floor: positive, growing FCF + healthy yield + light leverage", () => {
    const r = assessCashFlowQuality(STRONG);
    expect(r.status).toBe("pass");
    expect(r.reasons).toEqual([]);
    // Detail surfaces the supportive figures.
    expect(r.detail).toMatch(/yield/i);
  });

  it("passes when leverage/yield are unknown but FCF is positive and not declining", () => {
    const r = assessCashFlowQuality({
      ...EMPTY,
      freeCashFlow: 800_000_000,
      fcfTrend: "stable",
    });
    expect(r.status).toBe("pass");
  });

  it("flags negative free cash flow as a value-trap signal", () => {
    const r = assessCashFlowQuality({ ...STRONG, freeCashFlow: -200_000_000 });
    expect(r.status).toBe("flag");
    expect(r.reasons.join(" ")).toMatch(/negative/i);
  });

  it("flags declining FCF even when the level is still positive", () => {
    const r = assessCashFlowQuality({ ...STRONG, fcfTrend: "declining" });
    expect(r.status).toBe("flag");
    expect(r.reasons.join(" ")).toMatch(/declin/i);
  });

  it("flags heavy leverage (high debt-to-equity)", () => {
    const r = assessCashFlowQuality({
      ...STRONG,
      debtToEquity: CASH_FLOW_THRESHOLDS.debtToEquityHeavy + 0.5,
    });
    expect(r.status).toBe("flag");
    expect(r.reasons.join(" ")).toMatch(/leverage|debt/i);
  });

  it("flags thin interest coverage", () => {
    const r = assessCashFlowQuality({
      ...STRONG,
      interestCoverage: CASH_FLOW_THRESHOLDS.interestCoverageWeak - 1,
    });
    expect(r.status).toBe("flag");
    expect(r.reasons.join(" ")).toMatch(/coverage/i);
  });

  it("lets a deterioration signal win over otherwise-strong figures", () => {
    // Positive FCF + great yield, but leverage is heavy → still a flag.
    const r = assessCashFlowQuality({
      ...STRONG,
      debtToEquity: 4,
    });
    expect(r.status).toBe("flag");
  });

  it("stays neutral (na, not a pass) when FCF is positive but the yield is known-thin", () => {
    const r = assessCashFlowQuality({
      ...EMPTY,
      freeCashFlow: 100_000_000,
      fcfTrend: "stable",
      fcfYield: 0.005, // below the healthy floor — not a clean floor, not a trap
    });
    expect(r.status).toBe("na");
    expect(r.reasons).toEqual([]);
  });

  // Bank/financial leverage is by design (deposit-funded) — generic D/E and
  // interest-coverage are category errors and must NOT fire for the sector.
  it("does NOT flag heavy leverage / thin coverage for a Finance-sector name", () => {
    const bank = {
      ...EMPTY,
      freeCashFlow: 500_000_000,
      fcfTrend: "stable" as const,
      netDebt: 18_630_000_000,
      debtToEquity: 3.1,
      interestCoverage: 0.3,
    };
    // Generic call would flag this on leverage + coverage.
    expect(assessCashFlowQuality(bank).status).toBe("flag");
    // Sector-aware call suppresses the misapplied leverage/coverage factors.
    const r = assessCashFlowQuality(bank, { sector: "Finance" });
    expect(r.reasons.join(" ")).not.toMatch(/leverage|debt|coverage/i);
    expect(r.status).not.toBe("flag");
  });

  it("still flags genuine deterioration (negative FCF) for a Finance-sector name", () => {
    const r = assessCashFlowQuality(
      { ...STRONG, freeCashFlow: -200_000_000 },
      { sector: "Financial Services" },
    );
    expect(r.status).toBe("flag");
    expect(r.reasons.join(" ")).toMatch(/negative/i);
  });
});

describe("isFinancialSector", () => {
  it("is false for null / unknown / non-financial sectors", () => {
    expect(isFinancialSector(null)).toBe(false);
    expect(isFinancialSector(undefined)).toBe(false);
    expect(isFinancialSector("Technology")).toBe(false);
    expect(isFinancialSector("Healthcare")).toBe(false);
  });

  it("matches the Finance sector across provider label variants", () => {
    expect(isFinancialSector("Finance")).toBe(true);
    expect(isFinancialSector("Financials")).toBe(true);
    expect(isFinancialSector("Financial Services")).toBe(true);
    expect(isFinancialSector("Banks")).toBe(true);
    expect(isFinancialSector("Insurance")).toBe(true);
    expect(isFinancialSector("Capital Markets")).toBe(true);
  });
});

describe("cashFlowTrendLabel", () => {
  it("labels each trend and falls back for null", () => {
    expect(cashFlowTrendLabel("growing")).toMatch(/grow/i);
    expect(cashFlowTrendLabel("declining")).toMatch(/declin/i);
    expect(cashFlowTrendLabel(null)).toBe("—");
  });
});
