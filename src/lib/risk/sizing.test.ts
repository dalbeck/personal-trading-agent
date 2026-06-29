import { describe, expect, it } from "vitest";
import { sizeByTargetWeight, sizeRiskToStop } from "./sizing";

describe("sizeRiskToStop (matches the original builder formula)", () => {
  it("takes the tighter of the risk cap and the size cap", () => {
    // equity 10k, entry 50, risk/share 4 → byRisk = (10000*0.02)/4 = 50 sh;
    // bySize = (10000*0.2)/50 = 40 sh → the size cap binds → 40.
    expect(
      sizeRiskToStop({
        equity: 10_000,
        entry: 50,
        riskPerShare: 4,
        perPositionRiskPct: 0.02,
        perPositionSizePct: 0.2,
        allowFractional: false,
      }),
    ).toBe(40);
  });

  it("floors fractional shares to 4 dp (never rounds up over a cap)", () => {
    // byRisk = (10000*0.02)/3 = 66.666… ; bySize = (10000*0.2)/50 = 40 → 40.
    // Use a wide stop so risk binds and we see the 4dp floor.
    const qty = sizeRiskToStop({
      equity: 10_000,
      entry: 50,
      riskPerShare: 7,
      perPositionRiskPct: 0.02,
      perPositionSizePct: 0.2,
      allowFractional: true,
    });
    // byRisk = 200/7 = 28.5714… → floored to 28.5714
    expect(qty).toBe(28.5714);
  });

  it("returns 0 for degenerate inputs", () => {
    expect(
      sizeRiskToStop({
        equity: 0,
        entry: 50,
        riskPerShare: 4,
        perPositionRiskPct: 0.02,
        perPositionSizePct: 0.2,
      }),
    ).toBe(0);
    expect(
      sizeRiskToStop({
        equity: 10_000,
        entry: 50,
        riskPerShare: 0,
        perPositionRiskPct: 0.02,
        perPositionSizePct: 0.2,
      }),
    ).toBe(0);
  });
});

describe("sizeByTargetWeight (target portfolio weight, no stop)", () => {
  it("sizes to the target weight when it's within the size cap", () => {
    // 40% of 10k = 4000 / entry 100 = 40 sh.
    expect(
      sizeByTargetWeight({
        equity: 10_000,
        entry: 100,
        targetWeightPct: 0.4,
        perPositionSizePct: 0.6,
        allowFractional: false,
      }),
    ).toBe(40);
  });

  it("clamps the target weight to the sleeve size cap (never exceeds it)", () => {
    // Ask for 80% but the cap is 60% → sized to 60% = 6000/100 = 60 sh.
    expect(
      sizeByTargetWeight({
        equity: 10_000,
        entry: 100,
        targetWeightPct: 0.8,
        perPositionSizePct: 0.6,
        allowFractional: false,
      }),
    ).toBe(60);
  });

  it("returns 0 for degenerate inputs", () => {
    expect(
      sizeByTargetWeight({
        equity: 10_000,
        entry: 0,
        targetWeightPct: 0.4,
        perPositionSizePct: 0.6,
      }),
    ).toBe(0);
    expect(
      sizeByTargetWeight({
        equity: 10_000,
        entry: 100,
        targetWeightPct: 0,
        perPositionSizePct: 0.6,
      }),
    ).toBe(0);
  });
});
