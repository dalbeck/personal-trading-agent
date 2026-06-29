import { describe, expect, it } from "vitest";
import { buildRebalanceTrades, type RebalanceHolding } from "./rebalance";
import type { SleeveDrift } from "./portfolio";
import type { Sleeve } from "./sleeves";

function drift(
  sleeve: Sleeve,
  status: SleeveDrift["status"],
  driftPct: number,
): SleeveDrift {
  return {
    sleeve,
    targetPct: 0,
    currentPct: 0,
    driftPct,
    status,
    pastBand: status !== "on-target",
  };
}

describe("buildRebalanceTrades (portfolio M5)", () => {
  it("trims an overweight sleeve by selling its holdings largest-first", () => {
    const holdings = new Map<Sleeve, RebalanceHolding[]>([
      [
        "core-long",
        [
          { symbol: "VOO", marketValue: 5000, qty: 10, lastPrice: 500 },
          { symbol: "VTI", marketValue: 1000, qty: 5, lastPrice: 200 },
        ],
      ],
    ]);
    // 10% over on a 10k book → trim ~$1000.
    const { trades } = buildRebalanceTrades({
      drift: [drift("core-long", "over", 0.1)],
      holdingsBySleeve: holdings,
      equity: 10_000,
      allowFractional: false,
    });
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: "VOO", action: "sell", qty: 2 });
    expect(trades[0].stagedPlan).toBeNull(); // a trim is one exit
  });

  it("adds to an underweight sleeve's largest holding, scaled in over tranches", () => {
    const holdings = new Map<Sleeve, RebalanceHolding[]>([
      ["position-mid", [{ symbol: "MSFT", marketValue: 1000, qty: 4, lastPrice: 250 }]],
    ]);
    // 15% under on a 10k book → add ~$1500.
    const { trades } = buildRebalanceTrades({
      drift: [drift("position-mid", "under", -0.15)],
      holdingsBySleeve: holdings,
      equity: 10_000,
      allowFractional: false,
    });
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ symbol: "MSFT", action: "buy", qty: 6 });
    expect(trades[0].stagedPlan).not.toBeNull(); // an add scales in
    expect(trades[0].stagedPlan!.tranches.length).toBeGreaterThan(1);
  });

  it("surfaces an underweight sleeve with no holding as a gap (no fabricated order)", () => {
    const { trades, gaps } = buildRebalanceTrades({
      drift: [drift("swing-trend", "under", -0.15)],
      holdingsBySleeve: new Map(),
      equity: 10_000,
    });
    expect(trades).toHaveLength(0);
    expect(gaps).toEqual([{ sleeve: "swing-trend", deficitUsd: 1500 }]);
  });

  it("ignores on-target / within-band sleeves and dust trades", () => {
    const { trades, gaps } = buildRebalanceTrades({
      drift: [
        drift("core-long", "on-target", 0.01),
        drift("position-mid", "under", -0.001), // $10 deficit < $25 min
      ],
      holdingsBySleeve: new Map([
        ["position-mid", [{ symbol: "MSFT", marketValue: 1000, qty: 4, lastPrice: 250 }]],
      ]),
      equity: 10_000,
    });
    expect(trades).toHaveLength(0);
    expect(gaps).toHaveLength(0);
  });
});
