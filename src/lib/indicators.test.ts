import { describe, expect, it } from "vitest";
import { atr, sma, type Ohlc } from "./indicators";

describe("sma", () => {
  it("averages the trailing `period` closes", () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3);
    expect(sma([2, 4, 6], 2)).toBe(5); // (4+6)/2
  });

  it("returns null when there is not enough history", () => {
    expect(sma([1, 2], 5)).toBeNull();
    expect(sma([], 3)).toBeNull();
  });
});

describe("atr", () => {
  const bar = (h: number, l: number, c: number): Ohlc => ({
    o: l,
    h,
    l,
    c,
    v: 1_000,
    t: "",
  });

  it("is the average true range over the period", () => {
    // Flat $1-wide bars with no gaps → every true range is exactly 1, so ATR=1.
    const bars = Array.from({ length: 20 }, () => bar(11, 10, 10.5));
    expect(atr(bars, 14)).toBeCloseTo(1, 6);
  });

  it("accounts for gaps via the prior close (true range > high-low)", () => {
    const bars: Ohlc[] = [
      bar(10, 9, 9.5),
      // Gaps up: high 20, low 19, prior close 9.5 → TR = 20 - 9.5 = 10.5.
      bar(20, 19, 19.5),
    ];
    // period 1 → just the last bar's TR.
    expect(atr(bars, 1)).toBeCloseTo(10.5, 6);
  });

  it("returns null when there is not enough history", () => {
    expect(atr([bar(11, 10, 10.5)], 14)).toBeNull();
    expect(atr([], 14)).toBeNull();
  });
});
