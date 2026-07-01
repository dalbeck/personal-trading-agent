import { describe, expect, it } from "vitest";
import {
  PRESET_FILTERS,
  SCAN_RESULT_LIMIT_MAX,
  clampFilters,
  emptyFilters,
  filtersForPreset,
  parseScanPreset,
  resolveScanFilters,
} from "./scanner";

describe("parseScanPreset", () => {
  it("accepts known presets and defaults the rest to trend", () => {
    expect(parseScanPreset("trend")).toBe("trend");
    expect(parseScanPreset("value")).toBe("value");
    expect(parseScanPreset("earnings-soon")).toBe("earnings-soon");
    expect(parseScanPreset("custom")).toBe("custom");
    expect(parseScanPreset("nonsense")).toBe("trend");
    expect(parseScanPreset(undefined)).toBe("trend");
    expect(parseScanPreset(42)).toBe("trend");
  });
});

describe("filtersForPreset", () => {
  it("returns the trend preset (RSI band, volume + market-cap confirmation)", () => {
    const f = filtersForPreset("trend");
    expect(f.rsiMin).toBe(50);
    expect(f.rsiMax).toBe(80);
    expect(f.minRelativeVolume).toBe(1.3);
    expect(f.minMarketCap).toBe(2_000_000_000);
  });

  it("returns the value preset (oversold, no trend gates)", () => {
    const f = filtersForPreset("value");
    expect(f.rsiMax).toBe(35);
    expect(f.minRelativeVolume).toBeNull();
    expect(f.minMarketCap).toBeNull();
  });

  it("returns an earnings window for earnings-soon", () => {
    expect(filtersForPreset("earnings-soon").earningsWithinDays).toBe(14);
  });

  it("returns empty filters for custom (no preset gates)", () => {
    expect(filtersForPreset("custom")).toEqual(emptyFilters());
  });

  it("does not alias the shared preset objects (returns a copy)", () => {
    const f = filtersForPreset("trend");
    f.rsiMin = 1;
    expect(PRESET_FILTERS.trend.rsiMin).toBe(50);
  });
});

describe("clampFilters", () => {
  it("bounds RSI to 0–100 and the limit to the max", () => {
    const f = clampFilters({ rsiMin: -5, rsiMax: 250, limit: 9999 });
    expect(f.rsiMin).toBe(0);
    expect(f.rsiMax).toBe(100);
    expect(f.limit).toBe(SCAN_RESULT_LIMIT_MAX);
  });

  it("bounds the earnings window to 1–90 days", () => {
    expect(clampFilters({ earningsWithinDays: 0 }).earningsWithinDays).toBe(1);
    expect(clampFilters({ earningsWithinDays: 365 }).earningsWithinDays).toBe(90);
  });

  it("treats garbage / missing values as no filter, with a default limit", () => {
    const f = clampFilters({ rsiMin: NaN, minRelativeVolume: "x" as never });
    expect(f.rsiMin).toBeNull();
    expect(f.minRelativeVolume).toBeNull();
    expect(f.limit).toBeGreaterThan(0);
  });

  it("bounds the market-cap floor to 0..max and treats garbage as no filter", () => {
    expect(clampFilters({ minMarketCap: -5 }).minMarketCap).toBe(0);
    expect(clampFilters({ minMarketCap: 5e9 }).minMarketCap).toBe(5e9);
    expect(clampFilters({ minMarketCap: "x" as never }).minMarketCap).toBeNull();
  });
});

describe("resolveScanFilters", () => {
  it("starts from the preset then applies + clamps overrides", () => {
    const f = resolveScanFilters("trend", { rsiMin: 60, limit: 5 });
    expect(f.rsiMin).toBe(60); // override wins
    expect(f.minMarketCap).toBe(2_000_000_000); // preset default kept
    expect(f.limit).toBe(5);
  });

  it("for custom, the overrides are the whole (clamped) filter set", () => {
    const f = resolveScanFilters("custom", { rsiMax: 40, limit: 999 });
    expect(f.rsiMax).toBe(40);
    expect(f.minMarketCap).toBeNull();
    expect(f.limit).toBe(SCAN_RESULT_LIMIT_MAX);
  });
});
