import { describe, expect, it } from "vitest";
import {
  isResearchUnavailable,
  researchUnavailableLabel,
} from "@/lib/research-availability";

describe("isResearchUnavailable", () => {
  it("is false when research ran ok or is unknown (null)", () => {
    expect(isResearchUnavailable("ok")).toBe(false);
    expect(isResearchUnavailable(null)).toBe(false);
    expect(isResearchUnavailable(undefined)).toBe(false);
  });

  it("is true when research is off / capped / failed", () => {
    expect(isResearchUnavailable("off")).toBe(true);
    expect(isResearchUnavailable("capped")).toBe(true);
    expect(isResearchUnavailable("unavailable")).toBe(true);
  });
});

describe("researchUnavailableLabel", () => {
  it("explains WHY the data is unavailable (not a silent dash)", () => {
    expect(researchUnavailableLabel("off")).toMatch(/off/i);
    expect(researchUnavailableLabel("capped")).toMatch(/cap/i);
    expect(researchUnavailableLabel("unavailable")).toMatch(/unavailable|failed/i);
  });

  it("returns null when research is available / unknown", () => {
    expect(researchUnavailableLabel("ok")).toBeNull();
    expect(researchUnavailableLabel(null)).toBeNull();
  });
});
