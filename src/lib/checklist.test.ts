import { describe, expect, it } from "vitest";
import { buildChecklist } from "./checklist";
import { TradeProposalSchema } from "./schemas";
import type { TradeProposal } from "./types";

/** A clean baseline proposal; override per case. Defaults to the trend mandate. */
function makeProposal(overrides: Partial<TradeProposal> = {}): TradeProposal {
  return TradeProposalSchema.parse({
    id: "p-1",
    createdAt: "2026-06-26T13:30:00-04:00",
    symbol: "KR",
    action: "buy",
    qty: 10,
    limitPrice: 50,
    stopPrice: 46, // below entry → a real stop
    takeProfit: 60,
    targetType: "fundamental",
    riskPct: 0.015,
    catalyst: "Dividend hike + margin stabilization",
    catalystType: "guidance",
    thesis: "t",
    reasoning: "r",
    ...overrides,
  });
}

function item(list: ReturnType<typeof buildChecklist>, fragment: string) {
  return list.find((c) => c.label.includes(fragment));
}

describe("buildChecklist — trend mandate", () => {
  it("includes the breakout-volume item and trend-framed labels", () => {
    const list = buildChecklist(makeProposal({ strategy: "trend" }));
    expect(item(list, "Volume confirms")).toBeDefined();
    expect(item(list, "Protective stop defined")).toBeDefined();
    expect(item(list, "Catalyst — why now")).toBeDefined();
    // No value-framed labels.
    expect(item(list, "Mean-reversion")).toBeUndefined();
    expect(item(list, "or floor")).toBeUndefined();
  });
});

describe("buildChecklist — value mandate", () => {
  it("reframes stop/target/catalyst for value and drops breakout volume", () => {
    const list = buildChecklist(makeProposal({ strategy: "value" }));
    expect(item(list, "Mean-reversion stop below support")).toBeDefined();
    expect(item(list, "Discount / target anchored")).toBeDefined();
    expect(item(list, "Catalyst or floor — why now")).toBeDefined();
    // The breakout-volume item is trend-only — value never carries it.
    expect(item(list, "Volume confirms")).toBeUndefined();
  });

  it("does NOT flag a value proposal merely for low / no breakout volume", () => {
    // A below-average rel-volume that WOULD flag the trend volume check.
    const list = buildChecklist(
      makeProposal({ strategy: "value", relativeVolume: 0.4 }),
    );
    // No volume item exists to flag at all.
    expect(list.some((c) => c.label.includes("Volume"))).toBe(false);
    // The remaining items pass on a well-formed value pick.
    expect(item(list, "Discount / target anchored")?.status).toBe("pass");
  });

  it("treats a `fundamental` target as a pass (appropriate for value)", () => {
    const list = buildChecklist(
      makeProposal({ strategy: "value", targetType: "fundamental" }),
    );
    expect(item(list, "Discount / target anchored")?.status).toBe("pass");
  });

  it("still flags a value-trap signal: no catalyst or floor", () => {
    const list = buildChecklist(
      makeProposal({ strategy: "value", catalyst: null, catalystType: "none" }),
    );
    expect(item(list, "Catalyst or floor — why now")?.status).toBe("flag");
  });

  it("shares the hard rails — flags a thin reward/risk and an over-cap risk", () => {
    const list = buildChecklist(
      makeProposal({
        strategy: "value",
        takeProfit: 52, // ~0.5:1 R:R
        riskPct: 0.05, // over the 2% cap
      }),
    );
    expect(item(list, "Reward : risk")?.status).toBe("flag");
    expect(item(list, "Risk ≤")?.status).toBe("flag");
  });
});
