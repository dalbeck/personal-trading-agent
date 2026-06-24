import { describe, expect, it } from "vitest";
import {
  computeRiskReward,
  describeRiskReward,
  formatRatio,
} from "./risk-reward";

/**
 * The R:R geometry drives a decorative bar on every proposal card, so the math
 * has to be right in both directions and degrade — never render a broken or
 * zero-width bar — when the inputs don't describe a real risk/reward.
 */
describe("computeRiskReward", () => {
  it("computes a long (buy) proposal: stop below, target above entry", () => {
    // GOOGL seed proposal: entry 178.50, stop 168, target 205.
    const rr = computeRiskReward({
      action: "buy",
      entry: 178.5,
      stop: 168,
      target: 205,
    });
    expect(rr).not.toBeNull();
    expect(rr!.risk).toBeCloseTo(10.5, 5);
    expect(rr!.reward).toBeCloseTo(26.5, 5);
    expect(rr!.ratio).toBeCloseTo(26.5 / 10.5, 5);
    expect(rr!.riskFraction).toBeCloseTo(10.5 / 37, 5);
    expect(rr!.rewardFraction).toBeCloseTo(26.5 / 37, 5);
    // The fractions partition the bar exactly.
    expect(rr!.riskFraction + rr!.rewardFraction).toBeCloseTo(1, 10);
    // Buy: stop is below entry (negative %), target above (positive %).
    expect(rr!.stopPctFromEntry).toBeLessThan(0);
    expect(rr!.targetPctFromEntry).toBeGreaterThan(0);
    expect(rr!.stopPctFromEntry).toBeCloseTo((168 - 178.5) / 178.5, 6);
    expect(rr!.targetPctFromEntry).toBeCloseTo((205 - 178.5) / 178.5, 6);
  });

  it("computes a short (sell) proposal: stop above, target below entry", () => {
    // Sell to open / short: entry 100, protective stop 110, target 80.
    const rr = computeRiskReward({
      action: "sell",
      entry: 100,
      stop: 110,
      target: 80,
    });
    expect(rr).not.toBeNull();
    expect(rr!.risk).toBeCloseTo(10, 5);
    expect(rr!.reward).toBeCloseTo(20, 5);
    expect(rr!.ratio).toBeCloseTo(2, 5);
    expect(rr!.riskFraction).toBeCloseTo(1 / 3, 5);
    expect(rr!.rewardFraction).toBeCloseTo(2 / 3, 5);
    // Sell: stop is above entry (positive %), target below (negative %).
    expect(rr!.stopPctFromEntry).toBeGreaterThan(0);
    expect(rr!.targetPctFromEntry).toBeLessThan(0);
  });

  it("returns null when the stop is missing", () => {
    expect(
      computeRiskReward({ action: "buy", entry: 100, stop: null, target: 120 }),
    ).toBeNull();
  });

  it("returns null when the target is missing", () => {
    expect(
      computeRiskReward({ action: "buy", entry: 100, stop: 90, target: null }),
    ).toBeNull();
  });

  it("returns null when stop/target sit on the wrong side of entry (buy)", () => {
    // A buy whose stop is ABOVE entry and target BELOW would render a broken bar.
    expect(
      computeRiskReward({ action: "buy", entry: 100, stop: 110, target: 80 }),
    ).toBeNull();
  });

  it("returns null when stop/target sit on the wrong side of entry (sell)", () => {
    expect(
      computeRiskReward({ action: "sell", entry: 100, stop: 90, target: 120 }),
    ).toBeNull();
  });

  it("returns null for a zero-distance leg (stop or target at entry)", () => {
    expect(
      computeRiskReward({ action: "buy", entry: 100, stop: 100, target: 120 }),
    ).toBeNull();
    expect(
      computeRiskReward({ action: "buy", entry: 100, stop: 90, target: 100 }),
    ).toBeNull();
  });

  it("returns null on non-finite or zero entry", () => {
    expect(
      computeRiskReward({ action: "buy", entry: 0, stop: -10, target: 10 }),
    ).toBeNull();
    expect(
      computeRiskReward({
        action: "buy",
        entry: Number.NaN,
        stop: 90,
        target: 120,
      }),
    ).toBeNull();
  });
});

describe("formatRatio", () => {
  it("rounds to one decimal and trims whole numbers", () => {
    expect(formatRatio(26.5 / 10.5)).toBe("2.5 : 1");
    expect(formatRatio(2)).toBe("2 : 1");
    expect(formatRatio(3.04)).toBe("3 : 1");
    expect(formatRatio(1.25)).toBe("1.3 : 1");
  });
});

describe("describeRiskReward", () => {
  it("produces a screen-reader sentence with entry, stop, target and the ratio", () => {
    const rr = computeRiskReward({
      action: "buy",
      entry: 178.5,
      stop: 168,
      target: 205,
    })!;
    const text = describeRiskReward({
      action: "buy",
      entry: 178.5,
      stop: 168,
      target: 205,
      rr,
    });
    expect(text).toContain("$178.50");
    expect(text).toContain("$168.00");
    expect(text).toContain("$205.00");
    expect(text).toContain("2.5 to 1");
    // Buy stop reads as a negative move from entry.
    expect(text).toMatch(/stop[^,]*−/);
  });
});
