import { describe, expect, it } from "vitest";
import {
  buildCostModel,
  DEFAULT_COST_CONFIG,
  fillsFromExecutedTrades,
  type CostFill,
  type MeteredCall,
} from "./cost-model";

const calls = (...pairs: [string, number][]): MeteredCall[] =>
  pairs.map(([at, cost]) => ({ at, cost }));

const fill = (notionalUsd: number, fillVsMidUsd?: number): CostFill => ({
  notionalUsd,
  fillVsMidUsd: fillVsMidUsd ?? null,
});

describe("buildCostModel", () => {
  it("itemizes fixed (amortized), metered, slippage, and commission over a window", () => {
    const model = buildCostModel({
      windowStart: "2026-01-01",
      windowEnd: "2026-04-01", // 90 calendar days
      capitalBaseUsd: 1000,
      meteredCalls: calls(
        ["2026-01-15T10:00:00Z", 0.008],
        ["2026-03-20T10:00:00Z", 0.009],
      ),
      fills: [fill(1000), fill(2000)],
      config: {
        fixedApiAnnualUsd: 228,
        slippageBpsPerSide: 5,
        commissionPerTradeUsd: 0,
      },
    });

    expect(model.windowDays).toBe(90);
    // 228 * 90/365
    expect(model.lines.fixedApi.amountUsd).toBeCloseTo(56.2191, 3);
    expect(model.lines.meteredApi.amountUsd).toBeCloseTo(0.017, 6);
    // (1000 + 2000) * 5bps
    expect(model.lines.slippage.amountUsd).toBeCloseTo(1.5, 6);
    expect(model.lines.commission.amountUsd).toBe(0);

    const total = 56.21917808 + 0.017 + 1.5 + 0;
    expect(model.totalUsd).toBeCloseTo(total, 3);
    expect(model.costDragPct).toBeCloseTo(total / 1000, 6);
    expect(model.fills).toBe(2);
  });

  it("yields $0 fixed API cost on the free tier (annual = 0, the default)", () => {
    expect(DEFAULT_COST_CONFIG.fixedApiAnnualUsd).toBe(0);
    const model = buildCostModel({
      windowStart: "2026-01-01",
      windowEnd: "2026-04-01",
      capitalBaseUsd: 1000,
      meteredCalls: [],
      fills: [],
    });
    expect(model.lines.fixedApi.amountUsd).toBe(0);
  });

  it("uses realized fill-vs-mid slippage when provided instead of the bps assumption", () => {
    const model = buildCostModel({
      windowStart: "2026-01-01",
      windowEnd: "2026-04-01",
      capitalBaseUsd: 1000,
      meteredCalls: [],
      // notional 10_000 would be $5 at 5bps; the realized $2.25 wins.
      fills: [fill(10_000, 2.25)],
      config: { ...DEFAULT_COST_CONFIG, slippageBpsPerSide: 5 },
    });
    expect(model.lines.slippage.amountUsd).toBeCloseTo(2.25, 6);
  });

  it("counts commission per executed fill when a commission is configured", () => {
    const model = buildCostModel({
      windowStart: "2026-01-01",
      windowEnd: "2026-04-01",
      capitalBaseUsd: 1000,
      meteredCalls: [],
      fills: [fill(1000), fill(1000), fill(1000)],
      config: { ...DEFAULT_COST_CONFIG, commissionPerTradeUsd: 0.65 },
    });
    expect(model.lines.commission.amountUsd).toBeCloseTo(1.95, 6);
  });

  it("excludes metered calls outside the window", () => {
    const model = buildCostModel({
      windowStart: "2026-02-01",
      windowEnd: "2026-02-28",
      capitalBaseUsd: 1000,
      meteredCalls: calls(
        ["2026-01-31T23:59:00Z", 1], // before
        ["2026-02-10T10:00:00Z", 0.01], // in
        ["2026-03-01T00:00:00Z", 1], // after
      ),
      fills: [],
    });
    expect(model.lines.meteredApi.amountUsd).toBeCloseTo(0.01, 6);
  });

  it("treats a missing per-call cost as $0 (free FMP calls don't bill)", () => {
    const model = buildCostModel({
      windowStart: "2026-01-01",
      windowEnd: "2026-04-01",
      capitalBaseUsd: 1000,
      meteredCalls: [{ at: "2026-02-01T10:00:00Z" }, { at: "2026-02-02T10:00:00Z", cost: null }],
      fills: [],
    });
    expect(model.lines.meteredApi.amountUsd).toBe(0);
  });

  it("returns a null drag when the capital base is unknown or zero", () => {
    const base = {
      windowStart: "2026-01-01",
      windowEnd: "2026-04-01",
      meteredCalls: [],
      fills: [fill(1000)],
      config: { ...DEFAULT_COST_CONFIG, slippageBpsPerSide: 5 },
    };
    expect(buildCostModel({ ...base, capitalBaseUsd: null }).costDragPct).toBeNull();
    expect(buildCostModel({ ...base, capitalBaseUsd: 0 }).costDragPct).toBeNull();
  });

  it("maps each executed trade side to a fill with |qty × price| notional", () => {
    const fills = fillsFromExecutedTrades([
      { qty: 10, price: 100 }, // 1000
      { qty: 3, price: 250 }, // 750
    ]);
    expect(fills).toEqual([
      { notionalUsd: 1000, fillVsMidUsd: null },
      { notionalUsd: 750, fillVsMidUsd: null },
    ]);
  });

  it("has a zero-day window (no amortized fixed cost) when dates are missing", () => {
    const model = buildCostModel({
      windowStart: null,
      windowEnd: null,
      capitalBaseUsd: 1000,
      meteredCalls: calls(["2026-02-01T10:00:00Z", 0.02]),
      fills: [],
      config: { ...DEFAULT_COST_CONFIG, fixedApiAnnualUsd: 365 },
    });
    expect(model.windowDays).toBe(0);
    expect(model.lines.fixedApi.amountUsd).toBe(0);
    // metered still summed (no bounds → all calls count)
    expect(model.lines.meteredApi.amountUsd).toBeCloseTo(0.02, 6);
  });
});
