import { describe, expect, it } from "vitest";
import {
  attributeSleeve,
  buildSleevePerformance,
  computeDrift,
  computeSleeveWeights,
  type AttributionEntry,
  type PerfPosition,
} from "./portfolio";

const journal: AttributionEntry[] = [
  { symbol: "VOO", timestamp: "2026-05-01T10:00:00-04:00", action: "buy", tags: ["sleeve:core-long"] },
  { symbol: "NVDA", timestamp: "2026-05-02T10:00:00-04:00", action: "buy", tags: ["sleeve:swing-trend"] },
  // KR: an older lens-tagged value buy, then a newer sleeve-tagged one wins.
  { symbol: "KR", timestamp: "2026-04-01T10:00:00-04:00", action: "buy", tags: ["lens:value"] },
  { symbol: "MSFT", timestamp: "2026-05-03T10:00:00-04:00", action: "buy", tags: ["sleeve:position-mid"] },
  { symbol: "XOM", timestamp: "2026-05-04T10:00:00-04:00", action: "buy", tags: [] }, // untagged
];

describe("attributeSleeve", () => {
  it("reads the sleeve:<id> tag from the most recent buy", () => {
    expect(attributeSleeve("VOO", journal)).toBe("core-long");
    expect(attributeSleeve("MSFT", journal)).toBe("position-mid");
  });

  it("falls back to a legacy lens:<strategy> tag → its swing sleeve", () => {
    expect(attributeSleeve("KR", journal)).toBe("swing-value");
  });

  it("returns 'unattributed' for an untagged or unseen symbol", () => {
    expect(attributeSleeve("XOM", journal)).toBe("unattributed");
    expect(attributeSleeve("ZZZZ", journal)).toBe("unattributed");
  });

  it("prefers a newer sleeve tag over an older one", () => {
    const j: AttributionEntry[] = [
      { symbol: "T", timestamp: "2026-01-01T10:00:00-04:00", action: "buy", tags: ["sleeve:swing-value"] },
      { symbol: "T", timestamp: "2026-06-01T10:00:00-04:00", action: "buy", tags: ["sleeve:position-mid"] },
    ];
    expect(attributeSleeve("T", j)).toBe("position-mid");
  });
});

describe("computeSleeveWeights", () => {
  it("rolls holdings up to per-sleeve weights vs equity", () => {
    const positions = [
      { symbol: "VOO", marketValue: 6000 },
      { symbol: "MSFT", marketValue: 2500 },
      { symbol: "NVDA", marketValue: 1000 },
      { symbol: "XOM", marketValue: 500 }, // unattributed
    ];
    const weights = computeSleeveWeights(positions, journal, 10_000);
    const by = Object.fromEntries(weights.map((w) => [w.sleeve, w.weightPct]));
    expect(by["core-long"]).toBeCloseTo(0.6);
    expect(by["position-mid"]).toBeCloseTo(0.25);
    expect(by["swing-trend"]).toBeCloseTo(0.1);
    expect(by["unattributed"]).toBeCloseTo(0.05);
  });
});

describe("computeDrift", () => {
  const current = [
    { sleeve: "core-long" as const, marketValueUsd: 6000, weightPct: 0.6 },
    { sleeve: "position-mid" as const, marketValueUsd: 1000, weightPct: 0.1 },
  ];
  const targets = [
    { sleeve: "core-long" as const, targetWeightPct: 0.6 },
    { sleeve: "position-mid" as const, targetWeightPct: 0.25 },
    { sleeve: "swing-trend" as const, targetWeightPct: 0.15 },
  ];

  it("flags an under-weight sleeve past the band as 'under'", () => {
    const drift = computeDrift(current, targets, 0.05);
    const mid = drift.find((d) => d.sleeve === "position-mid")!;
    expect(mid.status).toBe("under"); // 10% vs 25% target, −15% past 5% band
    expect(mid.pastBand).toBe(true);
    expect(mid.driftPct).toBeCloseTo(-0.15);
  });

  it("treats a targeted sleeve with no holding as fully under", () => {
    const drift = computeDrift(current, targets, 0.05);
    const swing = drift.find((d) => d.sleeve === "swing-trend")!;
    expect(swing.currentPct).toBe(0);
    expect(swing.status).toBe("under");
  });

  it("reads an on-target sleeve as on-target", () => {
    const drift = computeDrift(current, targets, 0.05);
    const core = drift.find((d) => d.sleeve === "core-long")!;
    expect(core.status).toBe("on-target");
    expect(core.pastBand).toBe(false);
  });
});

describe("buildSleevePerformance", () => {
  const positions: PerfPosition[] = [
    { symbol: "VOO", marketValue: 6500, costBasis: 6000, unrealizedPl: 500 },
    { symbol: "MSFT", marketValue: 2400, costBasis: 2500, unrealizedPl: -100 },
    { symbol: "XOM", marketValue: 500, costBasis: 480, unrealizedPl: 20 }, // unattributed
  ];

  it("rolls performance up per sleeve with no cross-sleeve bleed", () => {
    const perf = buildSleevePerformance(positions, journal);
    const core = perf.find((p) => p.sleeve === "core-long")!;
    expect(core.positions).toBe(1);
    expect(core.unrealizedPlUsd).toBe(500);
    expect(core.unrealizedPlPct).toBeCloseTo(500 / 6000);
    expect(core.benchmark).toBe("SPY total return");

    const mid = perf.find((p) => p.sleeve === "position-mid")!;
    expect(mid.unrealizedPlUsd).toBe(-100);
    expect(mid.benchmark).toBe("SPY");
  });

  it("buckets unattributed holdings separately with no benchmark", () => {
    const perf = buildSleevePerformance(positions, journal);
    const un = perf.find((p) => p.sleeve === "unattributed")!;
    expect(un.positions).toBe(1);
    expect(un.benchmark).toBeNull();
  });
});
