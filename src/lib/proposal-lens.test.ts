import { describe, expect, it } from "vitest";
import {
  buildProposalLenses,
  dualVerdictSummary,
  isDualLens,
  lensSleeveOf,
  multiVerdictSummary,
  proposalBreakdowns,
  resolveActiveLens,
} from "./proposal-lens";
import { TradeProposalSchema } from "./schemas";
import type {
  ProposalLensBreakdown,
  RedTeamVerdict,
  TradeProposal,
} from "./types";

const verdict = (v: RedTeamVerdict["verdict"]): RedTeamVerdict => ({
  verdict: v,
  notes: "n",
  factors: [],
  basis: null,
});

function lens(
  strategy: "trend" | "value",
  overrides: Partial<ProposalLensBreakdown> = {},
): ProposalLensBreakdown {
  return {
    strategy,
    sleeve: null,
    limitPrice: 50,
    stopPrice: 46,
    takeProfit: 60,
    targetType: strategy === "value" ? "fundamental" : "prior_high",
    qty: 10,
    riskPct: 0.015,
    targetWeightPct: null,
    reviewTriggerPct: null,
    relativeVolume: 0.9,
    catalyst: "Dividend hike",
    catalystType: "guidance",
    catalystSources: [],
    catalystState: null,
    convictionScore: strategy === "value" ? 0.6 : 0.4,
    convictionTier: strategy === "value" ? "moderate" : "moderate",
    confidence: 0.5,
    thesis: `${strategy} thesis`,
    reasoning: `${strategy} reasoning`,
    redTeam: verdict(strategy === "value" ? "concern" : "reject"),
    cashFlow: null,
    dividend: null,
    researchStatus: null,
    researchStatusReason: null,
    cashFlowSource: null,
    dividendSource: null,
    ...overrides,
  };
}

function makeProposal(overrides: Partial<TradeProposal> = {}): TradeProposal {
  return TradeProposalSchema.parse({
    id: "p-1",
    createdAt: "2026-06-26T13:30:00-04:00",
    symbol: "KR",
    action: "buy",
    qty: 10,
    limitPrice: 50,
    stopPrice: 46,
    takeProfit: 60,
    targetType: "fundamental",
    riskPct: 0.015,
    catalyst: "Dividend hike",
    catalystType: "guidance",
    thesis: "t",
    reasoning: "r",
    ...overrides,
  });
}

describe("buildProposalLenses — single-lens", () => {
  it("derives one lens from the top-level fields, with its checklist", () => {
    const p = makeProposal({ strategy: "value", redTeam: verdict("concern") });
    const lenses = buildProposalLenses(p);
    expect(lenses).toHaveLength(1);
    expect(lenses[0].strategy).toBe("value");
    expect(lenses[0].redTeam?.verdict).toBe("concern");
    expect(lenses[0].thesis).toBe("t");
    expect(
      lenses[0].checklist.some((c) =>
        c.label.includes("Mean-reversion stop below support"),
      ),
    ).toBe(true);
  });

  it("is not dual", () => {
    expect(isDualLens(buildProposalLenses(makeProposal()))).toBe(false);
  });
});

describe("buildProposalLenses — dual-lens (manual analyze)", () => {
  const p = makeProposal({
    strategy: "value",
    lenses: [lens("trend"), lens("value")],
  });

  it("returns one view per lens, each with its own checklist + verdict", () => {
    const lenses = buildProposalLenses(p);
    expect(lenses.map((l) => l.strategy)).toEqual(["trend", "value"]);
    // Trend lens has the breakout-volume item; value lens does not.
    const trend = lenses[0];
    const value = lenses[1];
    expect(trend.checklist.some((c) => c.label === "Volume confirms")).toBe(true);
    expect(value.checklist.some((c) => c.label === "Volume confirms")).toBe(
      false,
    );
    expect(trend.redTeam?.verdict).toBe("reject");
    expect(value.redTeam?.verdict).toBe("concern");
  });

  it("is dual + summarizes both verdicts at a glance", () => {
    const lenses = buildProposalLenses(p);
    expect(isDualLens(lenses)).toBe(true);
    expect(dualVerdictSummary(lenses)).toBe("Trend: reject · Value: concern");
  });
});

describe("proposalBreakdowns", () => {
  it("returns the persisted lenses when dual, the synthetic top-level lens when single", () => {
    expect(
      proposalBreakdowns(makeProposal({ lenses: [lens("trend"), lens("value")] })),
    ).toHaveLength(2);
    expect(proposalBreakdowns(makeProposal())).toHaveLength(1);
  });
});

describe("resolveActiveLens", () => {
  const p = makeProposal({
    strategy: "value", // active default
    lenses: [
      lens("trend", { limitPrice: 51 }),
      lens("value", { limitPrice: 49 }),
    ],
  });

  it("picks the lens matching the requested acting strategy", () => {
    expect(resolveActiveLens(p, "trend").limitPrice).toBe(51);
    expect(resolveActiveLens(p, "value").limitPrice).toBe(49);
  });

  it("falls back to the proposal's active strategy when none requested", () => {
    expect(resolveActiveLens(p).strategy).toBe("value");
  });

  it("returns the lone top-level lens for a single-lens proposal", () => {
    const single = makeProposal({ strategy: "trend" });
    expect(resolveActiveLens(single, "value").strategy).toBe("trend");
  });
});

describe("multi-sleeve lens resolution (verdict-matrix M7)", () => {
  const trendLens = (): ProposalLensBreakdown =>
    lens("trend", { sleeve: null });
  const coreLens = (): ProposalLensBreakdown =>
    lens("value", { sleeve: "core-long", targetWeightPct: 0.4, stopPrice: null, takeProfit: null });
  const midLens = (): ProposalLensBreakdown =>
    lens("trend", { sleeve: "position-mid" });

  it("lensSleeveOf reads the explicit sleeve, else derives from strategy", () => {
    expect(lensSleeveOf(trendLens())).toBe("swing-trend");
    expect(lensSleeveOf(lens("value", { sleeve: null }))).toBe("swing-value");
    expect(lensSleeveOf(coreLens())).toBe("core-long");
    expect(lensSleeveOf(midLens())).toBe("position-mid");
  });

  it("resolveActiveLens picks the lens for a requested sleeve (incl. new sleeves)", () => {
    const p = makeProposal({
      lenses: [trendLens(), lens("value", { sleeve: null }), midLens(), coreLens()],
    });
    expect(lensSleeveOf(resolveActiveLens(p, "core-long"))).toBe("core-long");
    expect(lensSleeveOf(resolveActiveLens(p, "position-mid"))).toBe("position-mid");
    // A legacy trend/value request maps to its swing sleeve.
    expect(lensSleeveOf(resolveActiveLens(p, "value"))).toBe("swing-value");
  });

  it("multiVerdictSummary keys on the sleeve, with ✓/✗ marks", () => {
    const summary = multiVerdictSummary([
      { sleeve: "core-long", strategy: "value", redTeam: verdict("approve") },
      { sleeve: "position-mid", strategy: "trend", redTeam: verdict("concern") },
      { sleeve: null, strategy: "trend", redTeam: verdict("reject") },
    ]);
    expect(summary).toContain("Core ✓");
    expect(summary).toContain("Position concern");
    expect(summary).toContain("Trend ✗");
  });
});
