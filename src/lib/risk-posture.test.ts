import { describe, expect, it } from "vitest";
import {
  computeRiskPosture,
  levelForScore,
  riskPostureFromSnapshot,
  type PostureLimits,
  type RiskPostureInputs,
} from "@/lib/risk-posture";
import type { PortfolioSnapshot } from "@/lib/types";

const LIMITS: PostureLimits = {
  maxConcurrentPositions: 5,
  perPositionRiskPct: 0.02,
  perPositionSizePct: 0.2,
  drawdownHaltPct: 0.1,
};

function inputs(over: Partial<RiskPostureInputs>): RiskPostureInputs {
  return {
    equity: 10_000,
    cash: 10_000,
    positions: [],
    limits: LIMITS,
    drawdownPct: null,
    ...over,
  };
}

describe("levelForScore", () => {
  it("maps the documented bands", () => {
    expect(levelForScore(0)).toBe("Conservative");
    expect(levelForScore(32)).toBe("Conservative");
    expect(levelForScore(33)).toBe("Moderate");
    expect(levelForScore(66)).toBe("Moderate");
    expect(levelForScore(67)).toBe("Aggressive");
    expect(levelForScore(100)).toBe("Aggressive");
  });
});

describe("computeRiskPosture", () => {
  it("reads all-cash as fully conservative", () => {
    const p = computeRiskPosture(inputs({ equity: 10_000, cash: 10_000 }));
    expect(p.score).toBe(0);
    expect(p.level).toBe("Conservative");
    expect(p.summary).toContain("Conservative posture");
    expect(p.summary).toContain("mostly in cash");
  });

  it("reads a fully-loaded book as aggressive", () => {
    const positions = Array.from({ length: 5 }, (_, i) => ({
      symbol: `S${i}`,
      marketValue: 2_000, // each 20% of equity
      riskToStop: 300, // 3% of equity, over the 2% rail
    }));
    const p = computeRiskPosture(
      inputs({
        equity: 10_000,
        cash: 0,
        positions,
        drawdownPct: 0.08, // 80% of the 10% halt
        railsLoosened: true,
      }),
    );
    expect(p.score).toBeGreaterThan(66);
    expect(p.level).toBe("Aggressive");
    expect(p.summary).toContain("Aggressive posture");
    expect(p.summary).toContain("heavily deployed");
  });

  it("blends to a moderate reading", () => {
    const p = computeRiskPosture(
      inputs({
        equity: 10_000,
        cash: 7_500, // 25% deployed
        positions: [
          { symbol: "A", marketValue: 1_500, riskToStop: null }, // 15% top name
          { symbol: "B", marketValue: 1_000, riskToStop: null },
        ],
      }),
    );
    expect(p.level).toBe("Moderate");
    expect(p.score).toBeGreaterThanOrEqual(33);
    expect(p.score).toBeLessThanOrEqual(66);
    expect(p.summary).toContain("Balanced posture");
  });

  it("omits factors whose data is absent", () => {
    const p = computeRiskPosture(
      inputs({
        cash: 5_000,
        positions: [{ symbol: "A", marketValue: 5_000, riskToStop: null }],
        // no stops -> no riskPerTrade; drawdownPct null -> no drawdown;
        // railsLoosened undefined -> no rails factor
      }),
    );
    const keys = p.factors.map((f) => f.key);
    expect(keys).toEqual(["deployment", "concentration", "positions"]);
  });

  it("includes the rails factor only when the flag is provided", () => {
    const off = computeRiskPosture(inputs({ railsLoosened: false }));
    expect(off.factors.some((f) => f.key === "rails")).toBe(true);
    const absent = computeRiskPosture(inputs({}));
    expect(absent.factors.some((f) => f.key === "rails")).toBe(false);
  });

  it("clamps an over-concentrated name to 100", () => {
    const p = computeRiskPosture(
      inputs({
        cash: 0,
        positions: [{ symbol: "A", marketValue: 9_000, riskToStop: null }], // 90% > 20% cap
      }),
    );
    const conc = p.factors.find((f) => f.key === "concentration");
    expect(conc?.value).toBe(100);
  });
});

describe("riskPostureFromSnapshot", () => {
  function snapshot(over: Partial<PortfolioSnapshot>): PortfolioSnapshot {
    return {
      equity: 10_000,
      cash: 4_000,
      equityCurve: [
        { date: "2026-01-01", equity: 12_000 },
        { date: "2026-01-02", equity: 10_000 },
      ],
      positions: [
        {
          symbol: "AAA",
          side: "long",
          qty: 100,
          avgCost: 60,
          lastPrice: 60,
          marketValue: 6_000,
          costBasis: 6_000,
          unrealizedPl: 0,
          unrealizedPlPct: 0,
          stopPrice: 58, // risk = (60-58)*100 = 200 = 2% of equity
          openedAt: "2026-01-01",
        },
      ],
      ...over,
    } as PortfolioSnapshot;
  }

  it("derives drawdown from the equity curve high-water mark", () => {
    const p = riskPostureFromSnapshot(snapshot({}));
    const dd = p.factors.find((f) => f.key === "drawdown");
    // peak 12k -> now 10k = ~16.7% drawdown, well past the 10% halt -> clamps 100
    expect(dd).toBeDefined();
    expect(dd?.value).toBe(100);
  });

  it("derives risk-to-stop from the position stop", () => {
    const p = riskPostureFromSnapshot(snapshot({}));
    const risk = p.factors.find((f) => f.key === "riskPerTrade");
    // 200 risk on 10k equity = 2% = exactly the rail -> sub-score 100
    expect(risk?.value).toBe(100);
  });

  it("treats a flat/short curve as unobservable drawdown", () => {
    const p = riskPostureFromSnapshot(
      snapshot({ equityCurve: [{ date: "2026-01-01", equity: 10_000 }] }),
    );
    expect(p.factors.some((f) => f.key === "drawdown")).toBe(false);
  });
});
