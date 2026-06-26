import { describe, expect, it } from "vitest";
import {
  REL_VOLUME_BREAKOUT_MIN,
  REL_VOLUME_QUIET_MAX,
  computeRelativeVolume,
  formatRelativeVolume,
  relativeVolumeBand,
} from "./volume";

/** A flat baseline of `n` days at `vol`, then a current day at `current`. */
function series(baselineVol: number, days: number, current: number): number[] {
  return [...Array<number>(days).fill(baselineVol), current];
}

describe("computeRelativeVolume", () => {
  it("ratios the current day against the trailing average", () => {
    const rv = computeRelativeVolume(series(1_000_000, 20, 1_400_000));
    expect(rv).not.toBeNull();
    expect(rv!.ratio).toBeCloseTo(1.4, 5);
    expect(rv!.average).toBe(1_000_000);
    expect(rv!.current).toBe(1_400_000);
    expect(rv!.samples).toBe(20);
  });

  it("excludes the current day from its own baseline", () => {
    // 20 quiet days, then a 10× spike. The spike must not dilute the baseline.
    const rv = computeRelativeVolume(series(100, 20, 1_000));
    expect(rv!.average).toBe(100);
    expect(rv!.ratio).toBeCloseTo(10, 5);
  });

  it("caps the baseline at the lookback window", () => {
    // 80 prior days but lookback 50 → averages only the most recent 50.
    const vols = [...Array<number>(30).fill(10), ...Array<number>(50).fill(100), 200];
    const rv = computeRelativeVolume(vols, { lookback: 50 });
    expect(rv!.samples).toBe(50);
    expect(rv!.average).toBe(100);
    expect(rv!.ratio).toBeCloseTo(2, 5);
  });

  it("returns null with too few prior days", () => {
    expect(computeRelativeVolume(series(1_000, 19, 1_000))).toBeNull();
    expect(computeRelativeVolume([], { minSamples: 20 })).toBeNull();
  });

  it("returns null when the baseline average is zero", () => {
    expect(computeRelativeVolume(series(0, 20, 500))).toBeNull();
  });
});

describe("relativeVolumeBand", () => {
  it("bands high / average / low around the thresholds", () => {
    expect(relativeVolumeBand(REL_VOLUME_BREAKOUT_MIN)).toBe("high");
    expect(relativeVolumeBand(1.6)).toBe("high");
    expect(relativeVolumeBand(1.0)).toBe("average");
    expect(relativeVolumeBand(REL_VOLUME_QUIET_MAX)).toBe("average");
    expect(relativeVolumeBand(0.5)).toBe("low");
  });
});

describe("formatRelativeVolume", () => {
  it("renders a compact multiple", () => {
    expect(formatRelativeVolume(1.42)).toBe("1.4× avg");
    expect(formatRelativeVolume(0.6)).toBe("0.6× avg");
    expect(formatRelativeVolume(12.3)).toBe("12× avg");
  });
});
