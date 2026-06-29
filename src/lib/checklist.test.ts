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

describe("buildChecklist — sleeve threads through identically for swing", () => {
  it("swing-trend yields the byte-identical trend checklist", () => {
    const base = makeProposal({ strategy: "trend" });
    expect(buildChecklist({ ...base, sleeve: "swing-trend" })).toEqual(
      buildChecklist(base),
    );
  });

  it("swing-value yields the byte-identical value checklist", () => {
    const base = makeProposal({ strategy: "value" });
    expect(buildChecklist({ ...base, sleeve: "swing-value" })).toEqual(
      buildChecklist(base),
    );
  });

  it("the sleeve takes precedence over a mismatched strategy", () => {
    // A value-sleeve proposal whose stale top-level strategy still says trend is
    // judged under value (the sleeve wins).
    const p = makeProposal({ strategy: "trend", sleeve: "swing-value" });
    expect(buildChecklist(p)).toEqual(
      buildChecklist(makeProposal({ strategy: "value" })),
    );
  });
});

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

describe("catalyst state — three distinct states (catalyst-state-honesty M2)", () => {
  it("found: a named catalyst passes", () => {
    const list = buildChecklist(
      makeProposal({ catalyst: "Q3 beat-and-raise", catalystType: "earnings_momentum", catalystState: "found" }),
    );
    expect(item(list, "Catalyst — why now")?.status).toBe("pass");
  });

  it("none: searched but nothing material flags 'No catalyst found' (not 'unavailable')", () => {
    const it_ = item(
      buildChecklist(
        makeProposal({ catalyst: null, catalystType: null, catalystState: "none" }),
      ),
      "Catalyst — why now",
    );
    expect(it_?.status).toBe("flag");
    expect(it_?.detail).toBe("No catalyst found");
  });

  it("unavailable: a failed fetch flags 'Data unavailable — retry', NEVER 'no catalyst'", () => {
    const it_ = item(
      buildChecklist(
        makeProposal({ catalyst: null, catalystType: null, catalystState: "unavailable" }),
      ),
      "Catalyst — why now",
    );
    expect(it_?.status).toBe("flag");
    expect(it_?.detail).toBe("Data unavailable — retry");
    expect(it_?.detail).not.toMatch(/no catalyst/i);
  });

  it("older records (null state) derive from catalyst presence, never 'unavailable'", () => {
    expect(
      item(buildChecklist(makeProposal({ catalyst: null, catalystType: null })), "Catalyst — why now")
        ?.detail,
    ).toBe("No catalyst found");
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

  it("carries a Cash-flow quality item (value only) that passes a durable floor", () => {
    const trend = buildChecklist(makeProposal({ strategy: "trend" }));
    expect(item(trend, "Cash-flow quality")).toBeUndefined();

    const value = buildChecklist(
      makeProposal({
        strategy: "value",
        cashFlow: {
          operatingCashFlow: 1_500_000_000,
          freeCashFlow: 1_200_000_000,
          fcfTrend: "growing",
          fcfYield: 0.045,
          netDebt: -500_000_000,
          debtToEquity: 0.3,
          interestCoverage: 20,
        },
      }),
    );
    expect(item(value, "Cash-flow quality")?.status).toBe("pass");
  });

  it("flags Cash-flow quality on a value-trap signal (negative/declining FCF)", () => {
    const list = buildChecklist(
      makeProposal({
        strategy: "value",
        cashFlow: {
          operatingCashFlow: -100_000_000,
          freeCashFlow: -200_000_000,
          fcfTrend: "declining",
          fcfYield: null,
          netDebt: 3_000_000_000,
          debtToEquity: 3.5,
          interestCoverage: 1.5,
        },
      }),
    );
    expect(item(list, "Cash-flow quality")?.status).toBe("flag");
  });

  it("does NOT flag Cash-flow quality on financial-sector leverage (red-team-fixes Issue 1)", () => {
    const bank = {
      operatingCashFlow: null,
      freeCashFlow: 500_000_000,
      fcfTrend: "stable" as const,
      fcfYield: 0.04,
      netDebt: 18_630_000_000,
      debtToEquity: 3.1,
      interestCoverage: 0.3,
    };
    // Without sector, generic leverage/coverage would flag it.
    expect(
      item(
        buildChecklist(makeProposal({ strategy: "value", cashFlow: bank })),
        "Cash-flow quality",
      )?.status,
    ).toBe("flag");
    // With a Finance sector, those misapplied factors are suppressed.
    expect(
      item(
        buildChecklist(
          makeProposal({ strategy: "value", cashFlow: bank, sector: "Finance" }),
        ),
        "Cash-flow quality",
      )?.status,
    ).not.toBe("flag");
  });

  it("leaves Cash-flow quality as na (never a false pass) with no data", () => {
    const list = buildChecklist(makeProposal({ strategy: "value" }));
    expect(item(list, "Cash-flow quality")?.status).toBe("na");
    // With no research-status context, the detail is a bare "—".
    expect(item(list, "Cash-flow quality")?.detail).toBe("—");
  });

  it("says 'Data unavailable' (not a silent —) when research was off/capped/failed (M3)", () => {
    for (const status of ["off", "capped", "unavailable"] as const) {
      const list = buildChecklist(
        makeProposal({ strategy: "value", researchStatus: status }),
      );
      const cf = item(list, "Cash-flow quality");
      expect(cf?.status).toBe("na");
      expect(cf?.detail).toMatch(/Data unavailable/i);
      expect(cf?.detail).not.toBe("—");
    }
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
