import { describe, expect, it } from "vitest";
import {
  buildRegimeSummary,
  classifyTrend,
  rankSectors,
  regimeStance,
  sma,
  trailingReturn,
  vixBand,
  type SectorRank,
} from "./regime";

/** A rising series: 1..n. A falling series: n..1. */
const rising = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const falling = (n: number) => Array.from({ length: n }, (_, i) => n - i);

describe("sma", () => {
  it("averages the last `period` values, null when too few", () => {
    expect(sma([1, 2, 3, 4], 4)).toBe(2.5);
    expect(sma([10, 20, 30], 2)).toBe(25);
    expect(sma([1, 2], 3)).toBeNull();
  });
});

describe("trailingReturn", () => {
  it("returns the fractional change over the lookback", () => {
    expect(trailingReturn([100, 110], 1)).toBeCloseTo(0.1, 5);
    expect(trailingReturn([100, 90], 1)).toBeCloseTo(-0.1, 5);
  });
  it("is null with too little history or a zero base", () => {
    expect(trailingReturn([100], 1)).toBeNull();
    expect(trailingReturn([0, 100], 1)).toBeNull();
  });
});

describe("classifyTrend", () => {
  it("calls a rising series above its averages an uptrend", () => {
    expect(classifyTrend(rising(260))).toBe("uptrend");
  });
  it("calls a falling series a downtrend", () => {
    expect(classifyTrend(falling(260))).toBe("downtrend");
  });
  it("defaults to range when history is too short", () => {
    expect(classifyTrend(rising(50))).toBe("range");
  });
});

describe("vixBand", () => {
  it("bands by level, normal when unknown", () => {
    expect(vixBand(12)).toBe("calm");
    expect(vixBand(17)).toBe("normal");
    expect(vixBand(25)).toBe("elevated");
    expect(vixBand(40)).toBe("stressed");
    expect(vixBand(null)).toBe("normal");
  });
});

describe("rankSectors", () => {
  it("ranks by relative performance vs SPY, dropping unknowns", () => {
    const ranked = rankSectors(
      [
        { symbol: "XLK", name: "Technology", returnPct: 0.1 },
        { symbol: "XLU", name: "Utilities", returnPct: -0.05 },
        { symbol: "XLE", name: "Energy", returnPct: null },
      ],
      0.02,
    );
    expect(ranked.map((r) => r.symbol)).toEqual(["XLK", "XLU"]);
    expect(ranked[0].relativePct).toBeCloseTo(0.08, 5);
    expect(ranked[1].relativePct).toBeCloseTo(-0.07, 5);
  });
});

describe("regimeStance", () => {
  it("reads risk-on / risk-off / mixed from trend + VIX", () => {
    expect(regimeStance("uptrend", "calm")).toBe("Risk-on");
    expect(regimeStance("downtrend", "normal")).toBe("Risk-off");
    expect(regimeStance("uptrend", "stressed")).toBe("Risk-off");
    expect(regimeStance("range", "normal")).toBe("Mixed");
  });
});

describe("buildRegimeSummary", () => {
  const leaders: SectorRank[] = [
    { symbol: "XLK", name: "Technology", returnPct: 0.1, relativePct: 0.08 },
  ];
  const laggards: SectorRank[] = [
    { symbol: "XLU", name: "Utilities", returnPct: -0.05, relativePct: -0.07 },
  ];

  it("names the stance, trend, VIX, and rotation, and flags advisory", () => {
    const s = buildRegimeSummary("uptrend", 14.2, "calm", leaders, laggards);
    expect(s).toContain("Risk-on");
    expect(s).toContain("uptrend");
    expect(s).toContain("VIX 14.2 (calm)");
    expect(s).toContain("Technology");
    expect(s).toContain("Utilities");
    expect(s).toMatch(/advisory/i);
  });

  it("omits the rotation clause when sectors are unavailable", () => {
    const s = buildRegimeSummary("range", null, "normal", [], []);
    expect(s).not.toMatch(/rotating/i);
    expect(s).toMatch(/advisory/i);
  });
});
