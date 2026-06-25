import { describe, expect, it } from "vitest";
import { confidenceBucket } from "@/lib/confidence";

describe("confidenceBucket", () => {
  it("labels Low below the 40% threshold", () => {
    expect(confidenceBucket(0).level).toBe("Low");
    expect(confidenceBucket(0.2).level).toBe("Low");
    expect(confidenceBucket(0.39).level).toBe("Low");
  });

  it("labels Moderate in the 40–69% band, inclusive of the lower edge", () => {
    expect(confidenceBucket(0.4).level).toBe("Moderate");
    expect(confidenceBucket(0.55).level).toBe("Moderate");
    expect(confidenceBucket(0.69).level).toBe("Moderate");
  });

  it("labels High at and above 70%", () => {
    expect(confidenceBucket(0.7).level).toBe("High");
    expect(confidenceBucket(0.85).level).toBe("High");
    expect(confidenceBucket(1).level).toBe("High");
  });

  it("buckets on the rounded percent so the label matches the shown number", () => {
    // 0.695 -> 70% (rounds up) -> High; 0.694 -> 69% -> Moderate.
    expect(confidenceBucket(0.695)).toMatchObject({ pct: 70, level: "High" });
    expect(confidenceBucket(0.694)).toMatchObject({
      pct: 69,
      level: "Moderate",
    });
  });

  it("fills segments proportionally, never zero for a positive value", () => {
    expect(confidenceBucket(0).filled).toBe(0);
    expect(confidenceBucket(0.05).filled).toBe(1); // rounds to 0, floored up to 1
    expect(confidenceBucket(0.55).filled).toBe(3);
    expect(confidenceBucket(1).filled).toBe(5);
  });

  it("honors a custom segment count", () => {
    expect(confidenceBucket(0.5, 4)).toMatchObject({ filled: 2, segments: 4 });
    expect(confidenceBucket(1, 3)).toMatchObject({ filled: 3, segments: 3 });
  });

  it("clamps out-of-range and non-finite input", () => {
    expect(confidenceBucket(1.5)).toMatchObject({ pct: 100, level: "High" });
    expect(confidenceBucket(-0.2)).toMatchObject({ pct: 0, level: "Low" });
    expect(confidenceBucket(Number.NaN)).toMatchObject({ pct: 0, filled: 0 });
  });
});
