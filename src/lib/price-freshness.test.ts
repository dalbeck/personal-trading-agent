import { describe, expect, it } from "vitest";
import {
  STALE_DRIFT_THRESHOLD,
  computePriceDrift,
  driftLabel,
  isStaleEntry,
} from "@/lib/price-freshness";

describe("computePriceDrift", () => {
  it("returns the signed fraction the quote has moved from the entry", () => {
    expect(computePriceDrift(100, 105)).toBeCloseTo(0.05);
    expect(computePriceDrift(100, 95)).toBeCloseTo(-0.05);
    expect(computePriceDrift(100, 100)).toBe(0);
  });

  it("returns null for an unusable entry or non-finite inputs", () => {
    expect(computePriceDrift(0, 100)).toBeNull();
    expect(computePriceDrift(-5, 100)).toBeNull();
    expect(computePriceDrift(100, Number.NaN)).toBeNull();
    expect(computePriceDrift(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });
});

describe("isStaleEntry", () => {
  it("is stale only when the absolute drift exceeds the threshold", () => {
    // Default threshold is 1.5%.
    expect(isStaleEntry(100, 101)).toBe(false); // 1.0% drift
    expect(isStaleEntry(100, 102)).toBe(true); // 2.0% drift
    expect(isStaleEntry(135, 128)).toBe(true); // the JKHY case (~5.2%)
  });

  it("treats a drop below the entry symmetrically", () => {
    expect(isStaleEntry(100, 98)).toBe(true);
    expect(isStaleEntry(100, 99)).toBe(false);
  });

  it("honors a custom threshold", () => {
    expect(isStaleEntry(100, 103, 0.05)).toBe(false); // 3% < 5%
    expect(isStaleEntry(100, 106, 0.05)).toBe(true); // 6% > 5%
  });

  it("is never stale when the drift can't be computed (no/invalid quote)", () => {
    // A guard that can't read a quote must not block on staleness (fail-soft).
    expect(isStaleEntry(0, 100)).toBe(false);
    expect(isStaleEntry(100, Number.NaN)).toBe(false);
  });

  it("exposes a sane default threshold (1–2% band)", () => {
    expect(STALE_DRIFT_THRESHOLD).toBeGreaterThanOrEqual(0.01);
    expect(STALE_DRIFT_THRESHOLD).toBeLessThanOrEqual(0.02);
  });
});

describe("driftLabel", () => {
  it("formats a signed percentage, or — when uncomputable", () => {
    expect(driftLabel(100, 105)).toBe("+5.00%");
    expect(driftLabel(100, 95)).toBe("−5.00%");
    expect(driftLabel(0, 100)).toBe("—");
  });
});
