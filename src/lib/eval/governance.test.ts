import { describe, expect, it } from "vitest";
import {
  buildGovernanceScorecard,
  GOVERNANCE_LOW_SAMPLE,
  type GovernanceInput,
} from "./governance";

const judged = (verdict: "approve" | "reject" | "concern") => ({
  redTeam: { verdict },
});
const rej = (rejectedBy: GovernanceInput["rejections"][number]["rejectedBy"], tags: string[] = []) => ({
  rejectedBy,
  tags,
});

describe("buildGovernanceScorecard", () => {
  it("counts red-team verdict selectivity and rates", () => {
    const sc = buildGovernanceScorecard({
      proposals: [
        judged("approve"),
        judged("approve"),
        judged("reject"),
        judged("concern"),
        { redTeam: null }, // unjudged — excluded
      ],
      rejections: [],
      tradesPlaced: 2,
    });
    expect(sc.judged).toBe(4);
    expect(sc.redTeam).toMatchObject({ approve: 2, reject: 1, concern: 1 });
    expect(sc.redTeam.approveRate).toBeCloseTo(0.5);
    expect(sc.redTeam.rejectRate).toBeCloseTo(0.25);
  });

  it("nulls the rates when nothing was judged", () => {
    const sc = buildGovernanceScorecard({
      proposals: [{ redTeam: null }],
      rejections: [],
      tradesPlaced: 0,
    });
    expect(sc.redTeam.approveRate).toBeNull();
    expect(sc.redTeam.rejectRate).toBeNull();
  });

  it("tallies rejections by actor and per-rule from rule tags", () => {
    const sc = buildGovernanceScorecard({
      proposals: [],
      rejections: [
        rej("rules", ["rule:position-size"]),
        rej("rules", ["rule:position-size", "rule:winner-exit"]),
        rej("codex-redteam"),
        rej("human"),
        rej("rules", ["rule:sector-concentration"]),
      ],
      tradesPlaced: 1,
    });
    expect(sc.rejections.total).toBe(5);
    expect(sc.rejections.byActor).toEqual({ redTeam: 1, rules: 3, human: 1 });
    // Descending count; position-size (2) leads.
    expect(sc.rejections.byRule[0]).toEqual({ rule: "position-size", count: 2 });
    expect(sc.rejections.byRule).toContainEqual({
      rule: "winner-exit",
      count: 1,
    });
    expect(sc.rejections.byRule).toContainEqual({
      rule: "sector-concentration",
      count: 1,
    });
  });

  it("flags a low sample and clears the flag once enough decisions accrue", () => {
    const small = buildGovernanceScorecard({
      proposals: [judged("approve")],
      rejections: [rej("rules", ["rule:position-size"])],
      tradesPlaced: 0,
    });
    expect(small.sampleSize).toBe(2);
    expect(small.lowSample).toBe(true);

    const big = buildGovernanceScorecard({
      proposals: Array.from({ length: GOVERNANCE_LOW_SAMPLE }, () =>
        judged("approve"),
      ),
      rejections: [],
      tradesPlaced: 0,
    });
    expect(big.lowSample).toBe(false);
  });
});
