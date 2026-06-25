import { describe, expect, it } from "vitest";
import {
  ADVISORY_DECISIONS,
  ADVISORY_TAG,
  isAdvisoryProposal,
} from "./proposal-advisory";

describe("isAdvisoryProposal", () => {
  it("treats a live account proposal as advisory even without the flag", () => {
    // Fail-safe: a live proposal is advisory regardless of the explicit flag,
    // so a missing flag can never downgrade it into an executable proposal.
    expect(isAdvisoryProposal({ account: "live", advisory: false })).toBe(true);
  });

  it("treats an explicit advisory flag as advisory", () => {
    expect(isAdvisoryProposal({ account: "paper", advisory: true })).toBe(true);
  });

  it("treats a plain paper proposal as NOT advisory", () => {
    expect(isAdvisoryProposal({ account: "paper", advisory: false })).toBe(false);
  });
});

describe("advisory constants", () => {
  it("exposes the unmistakable tag and the two review decisions", () => {
    expect(ADVISORY_TAG).toBe("live · advisory · execute manually");
    expect([...ADVISORY_DECISIONS]).toEqual(["reviewed", "dismissed"]);
  });
});
