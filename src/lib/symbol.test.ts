import { describe, expect, it } from "vitest";
import { isValidSymbol, nearestIndex, normalizeSymbol } from "./symbol";

describe("nearestIndex", () => {
  it("snaps a plotting fraction to the nearest bar index", () => {
    expect(nearestIndex(0, 11)).toBe(0);
    expect(nearestIndex(1, 11)).toBe(10);
    expect(nearestIndex(0.5, 11)).toBe(5);
    expect(nearestIndex(0.54, 11)).toBe(5);
    expect(nearestIndex(0.56, 11)).toBe(6);
  });

  it("clamps out-of-range fractions to the first/last bar", () => {
    expect(nearestIndex(-0.3, 5)).toBe(0);
    expect(nearestIndex(1.7, 5)).toBe(4);
  });

  it("returns 0 for a degenerate (0 or 1 point) series", () => {
    expect(nearestIndex(0.5, 1)).toBe(0);
    expect(nearestIndex(0.5, 0)).toBe(0);
  });
});

describe("symbol normalize/validate", () => {
  it("uppercases and trims", () => {
    expect(normalizeSymbol(" nvda ")).toBe("NVDA");
  });

  it("accepts tickers with a dot or dash, rejects junk", () => {
    expect(isValidSymbol("BRK.B")).toBe(true);
    expect(isValidSymbol("AMD")).toBe(true);
    expect(isValidSymbol("@bad")).toBe(false);
    expect(isValidSymbol("")).toBe(false);
    expect(isValidSymbol("WAYTOOLONGSYMBOL")).toBe(false);
  });
});
