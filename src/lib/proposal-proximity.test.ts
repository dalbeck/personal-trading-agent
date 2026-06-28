import { describe, expect, it } from "vitest";
import {
  CAP_BELOW_CEILING,
  deriveApprovalProximity,
  PROXIMITY_BANDS,
  type ProximityVerdict,
} from "./proposal-proximity";
import type { TradeProposal } from "@/lib/types";

type Stance = "supports" | "refutes" | "neutral";

function redTeam(verdict: ProximityVerdict, stances: Stance[] = []) {
  return {
    verdict,
    notes: "x",
    basis: null,
    factors: stances.map((stance, i) => ({
      label: `f${i}`,
      assessment: "a",
      stance,
    })),
  };
}

const CASH_FLOW = { freeCashFlow: 1_000, operatingCashFlow: null, netDebt: null, fcfYield: 0.04, fcfTrend: "growing", debtToEquity: null, interestCoverage: null };
const DIVIDEND = { dividendYield: 0.02, payoutRatio: null, fcfPayout: null, fcfCoverage: 2.4, dividendCagr: null, growthStreakYears: 10 };

function prop(over: Partial<{
  strategy: "trend" | "value";
  convictionScore: number | null;
  cashFlow: unknown;
  dividend: unknown;
  redTeam: unknown;
}>): TradeProposal {
  return {
    strategy: "trend",
    convictionScore: null,
    cashFlow: null,
    dividend: null,
    redTeam: null,
    ...over,
  } as unknown as TradeProposal;
}

describe("deriveApprovalProximity — verdict sets the band", () => {
  const cases: [ProximityVerdict, number, number][] = [
    ["reject", 0, 33],
    ["concern", 34, 66],
    ["approve", 67, 100],
  ];
  for (const [verdict, floor, ceil] of cases) {
    it(`a ${verdict} proposal reads within ${floor}–${ceil}`, () => {
      const r = deriveApprovalProximity(prop({ redTeam: redTeam(verdict) }));
      expect(r.verdict).toBe(verdict);
      expect(r.band?.floor).toBe(floor);
      expect(r.band?.ceil).toBe(ceil);
      expect(r.value).not.toBeNull();
      expect(r.value!).toBeGreaterThanOrEqual(floor);
      expect(r.value!).toBeLessThanOrEqual(ceil);
    });
  }

  it("never contradicts the verdict even under extreme opposing pressure", () => {
    // An approve with many blocking factors + zero conviction still stays ≥ 67.
    const r = deriveApprovalProximity(
      prop({
        redTeam: redTeam("approve", ["refutes", "refutes", "refutes", "refutes", "refutes"]),
        convictionScore: 0,
      }),
    );
    expect(r.verdict).toBe("approve");
    expect(r.value!).toBeGreaterThanOrEqual(PROXIMITY_BANDS.approve.floor);

    // A reject loaded with supporting factors + max conviction still stays ≤ 33.
    const r2 = deriveApprovalProximity(
      prop({
        redTeam: redTeam("reject", ["supports", "supports", "supports", "supports", "supports"]),
        convictionScore: 1,
      }),
    );
    expect(r2.value!).toBeLessThanOrEqual(PROXIMITY_BANDS.reject.ceil);
  });
});

describe("deriveApprovalProximity — factor pressure", () => {
  it("more blocking (refuting) factors push the value toward the band floor", () => {
    const heavy = deriveApprovalProximity(
      prop({ redTeam: redTeam("concern", ["refutes", "refutes", "refutes"]) }),
    );
    const neutral = deriveApprovalProximity(
      prop({ redTeam: redTeam("concern") }),
    );
    const supported = deriveApprovalProximity(
      prop({ redTeam: redTeam("concern", ["supports", "supports", "supports"]) }),
    );
    expect(heavy.value!).toBeLessThan(neutral.value!);
    expect(supported.value!).toBeGreaterThan(neutral.value!);
    expect(heavy.drivers[0]).toEqual({ direction: "down", label: "3 blocking factors" });
  });
});

describe("deriveApprovalProximity — conviction modulation", () => {
  it("higher conviction nudges the value up within the band", () => {
    const low = deriveApprovalProximity(
      prop({ redTeam: redTeam("concern"), convictionScore: 0.2 }),
    );
    const high = deriveApprovalProximity(
      prop({ redTeam: redTeam("concern"), convictionScore: 0.8 }),
    );
    expect(high.value!).toBeGreaterThan(low.value!);
    expect(high.drivers).toContainEqual({ direction: "up", label: "conviction 80" });
    expect(low.drivers).toContainEqual({ direction: "down", label: "conviction 20" });
  });
});

describe("deriveApprovalProximity — data completeness cap", () => {
  it("caps a value proposal below the band ceiling when cash-flow/dividend is missing", () => {
    const r = deriveApprovalProximity(
      prop({
        strategy: "value",
        redTeam: redTeam("approve", ["supports", "supports"]),
        convictionScore: 0.9,
        cashFlow: null,
        dividend: null,
      }),
    );
    const cap = PROXIMITY_BANDS.approve.ceil - CAP_BELOW_CEILING;
    expect(r.capped).toBe(true);
    expect(r.value!).toBeLessThanOrEqual(cap);
    expect(r.capValue).toBe(cap);
    expect(r.capReason).toMatch(/cash-flow/i);
    expect(r.drivers).toContainEqual({
      direction: "down",
      label: r.capReason!,
    });
  });

  it("does not cap a value proposal once cash-flow and dividend are present", () => {
    const r = deriveApprovalProximity(
      prop({
        strategy: "value",
        redTeam: redTeam("approve", ["supports"]),
        convictionScore: 0.9,
        cashFlow: CASH_FLOW,
        dividend: DIVIDEND,
      }),
    );
    expect(r.capped).toBe(false);
    expect(r.capValue).toBeNull();
    expect(r.drivers).toContainEqual({ direction: "up", label: "full data coverage" });
  });

  it("does NOT cap a trend proposal for absent cash-flow (not part of its thesis)", () => {
    const r = deriveApprovalProximity(
      prop({
        strategy: "trend",
        redTeam: redTeam("approve", ["supports"]),
        convictionScore: 0.9,
        cashFlow: null,
        dividend: null,
      }),
    );
    expect(r.capped).toBe(false);
    // no data-coverage chip for trend (cash-flow isn't its thesis)
    expect(r.drivers.some((d) => /data/i.test(d.label))).toBe(false);
  });
});

describe("deriveApprovalProximity — unscored", () => {
  it("returns a null verdict/value when there is no red-team verdict yet", () => {
    const r = deriveApprovalProximity(prop({ redTeam: null }));
    expect(r.verdict).toBeNull();
    expect(r.value).toBeNull();
    expect(r.band).toBeNull();
    expect(r.drivers).toEqual([]);
  });
});
