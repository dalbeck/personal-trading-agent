import { describe, expect, it } from "vitest";
import {
  ADVISORY_DECISIONS,
  ADVISORY_TAG,
  LIVE_APPROVE_TAG,
  isAdvisoryProposal,
} from "./proposal-advisory";

describe("isAdvisoryProposal", () => {
  it("is advisory only when the explicit flag is set (manual guidance)", () => {
    expect(isAdvisoryProposal({ account: "live", advisory: true })).toBe(true);
    expect(isAdvisoryProposal({ account: "paper", advisory: true })).toBe(true);
  });

  it("an approvable live proposal (advisory:false) is NOT advisory", () => {
    // The order gate — not this flag — is the real-money boundary, so an
    // approvable live proposal is allowed to the approval path (where, gate
    // closed, it routes to the dry-run sink).
    expect(isAdvisoryProposal({ account: "live", advisory: false })).toBe(false);
  });

  it("treats a plain paper proposal as NOT advisory", () => {
    expect(isAdvisoryProposal({ account: "paper", advisory: false })).toBe(false);
  });
});

describe("advisory constants", () => {
  it("exposes the tags and the two review decisions", () => {
    expect(ADVISORY_TAG).toBe("live · advisory · execute manually");
    expect(LIVE_APPROVE_TAG).toBe("live · approve to place");
    expect([...ADVISORY_DECISIONS]).toEqual(["reviewed", "dismissed"]);
  });
});
