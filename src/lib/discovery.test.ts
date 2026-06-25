import { describe, expect, it } from "vitest";
import { discoveryProposalBudget } from "./discovery";

describe("discoveryProposalBudget", () => {
  it("is the per-run cap minus pending proposals", () => {
    expect(discoveryProposalBudget(0, 6)).toBe(6);
    expect(discoveryProposalBudget(2, 6)).toBe(4);
    expect(discoveryProposalBudget(6, 6)).toBe(0);
  });

  it("never goes negative when already over the cap", () => {
    expect(discoveryProposalBudget(9, 6)).toBe(0);
  });

  it("clamps a negative pending count to zero", () => {
    expect(discoveryProposalBudget(-3, 6)).toBe(6);
  });
});
