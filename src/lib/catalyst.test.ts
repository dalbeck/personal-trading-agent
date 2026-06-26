import { describe, expect, it } from "vitest";
import { catalystTypeLabel, isWeakCatalyst } from "./catalyst";

describe("isWeakCatalyst", () => {
  it("flags a missing catalyst and an explicit none as weak", () => {
    expect(isWeakCatalyst(null)).toBe(true);
    expect(isWeakCatalyst(undefined)).toBe(true);
    expect(isWeakCatalyst("none")).toBe(true);
  });

  it("treats a real catalyst type as strong", () => {
    expect(isWeakCatalyst("earnings_momentum")).toBe(false);
    expect(isWeakCatalyst("product_news")).toBe(false);
    expect(isWeakCatalyst("sector_rotation")).toBe(false);
    expect(isWeakCatalyst("guidance")).toBe(false);
    expect(isWeakCatalyst("other")).toBe(false);
  });
});

describe("catalystTypeLabel", () => {
  it("labels each type and falls back to Unspecified", () => {
    expect(catalystTypeLabel("earnings_momentum")).toBe("Earnings momentum");
    expect(catalystTypeLabel("none")).toBe("None");
    expect(catalystTypeLabel(null)).toBe("Unspecified");
    expect(catalystTypeLabel(undefined)).toBe("Unspecified");
  });
});
