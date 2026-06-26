import { describe, expect, it } from "vitest";
import {
  buildProposalLenses,
  dualVerdictSummary,
  isDualLens,
  type ProposalLens,
} from "./proposal-lens";
import { TradeProposalSchema } from "./schemas";
import type { RedTeamVerdict, TradeProposal } from "./types";

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

const verdict = (v: RedTeamVerdict["verdict"]): RedTeamVerdict => ({
  verdict: v,
  notes: "n",
  factors: [],
  basis: null,
});

describe("buildProposalLenses", () => {
  it("returns a single lens for a single-strategy proposal, carrying its checklist + verdict", () => {
    const p = makeProposal({ strategy: "value", redTeam: verdict("concern") });
    const lenses = buildProposalLenses(p);
    expect(lenses).toHaveLength(1);
    expect(lenses[0].strategy).toBe("value");
    expect(lenses[0].redTeam?.verdict).toBe("concern");
    // The checklist is the value mandate's (reframed labels).
    expect(
      lenses[0].checklist.some((c) =>
        c.label.includes("Mean-reversion stop below support"),
      ),
    ).toBe(true);
  });

  it("derives the trend checklist for a trend proposal", () => {
    const lenses = buildProposalLenses(makeProposal({ strategy: "trend" }));
    expect(lenses[0].strategy).toBe("trend");
    expect(lenses[0].checklist.some((c) => c.label === "Volume confirms")).toBe(
      true,
    );
  });

  it("is single-lens today (isDualLens false)", () => {
    expect(isDualLens(buildProposalLenses(makeProposal()))).toBe(false);
  });
});

describe("dual-lens helpers (forward-compatible)", () => {
  const dual: ProposalLens[] = [
    { strategy: "trend", redTeam: verdict("reject"), checklist: [] },
    { strategy: "value", redTeam: verdict("concern"), checklist: [] },
  ];

  it("flags a two-lens analysis as dual", () => {
    expect(isDualLens(dual)).toBe(true);
  });

  it("renders a glanceable dual-verdict summary", () => {
    expect(dualVerdictSummary(dual)).toBe("Trend: reject · Value: concern");
  });

  it("reads an un-judged lens as 'not run'", () => {
    expect(
      dualVerdictSummary([{ strategy: "trend", redTeam: null, checklist: [] }]),
    ).toBe("Trend: not run");
  });
});
