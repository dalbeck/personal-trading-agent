import { describe, expect, it } from "vitest";
import {
  STAGED_ENTRY_DEFAULTS,
  buildStagedEntryPlan,
  nextPendingTranche,
  stagedPlanFilledQty,
  stagedPlanTotalQty,
  trancheConditionText,
} from "@/lib/staged-entry";

describe("buildStagedEntryPlan", () => {
  it("splits the FULL position into equal tranches whose qty sums back to the full qty", () => {
    const plan = buildStagedEntryPlan({ fullQty: 9, trancheCount: 3, intervalDays: 5, driftBandPct: 0.05 });
    expect(plan).not.toBeNull();
    if (!plan) return;
    expect(plan.tranches).toHaveLength(3);
    expect(plan.tranches.map((t) => t.qty)).toEqual([3, 3, 3]);
    expect(stagedPlanTotalQty(plan)).toBeCloseTo(9);
  });

  it("puts any rounding remainder on the LAST tranche so the sum is exact", () => {
    const plan = buildStagedEntryPlan({ fullQty: 10, trancheCount: 3, allowFractional: false });
    expect(plan).not.toBeNull();
    if (!plan) return;
    // 10 / 3 → 3, 3, 4 (remainder on the last), summing to exactly 10.
    expect(plan.tranches.map((t) => t.qty)).toEqual([3, 3, 4]);
    expect(stagedPlanTotalQty(plan)).toBe(10);
  });

  it("supports fractional shares to 4dp, summing exactly to the full qty", () => {
    const plan = buildStagedEntryPlan({ fullQty: 0.0439, trancheCount: 3 });
    if (!plan) return;
    expect(stagedPlanTotalQty(plan)).toBeCloseTo(0.0439, 6);
    expect(plan.tranches.every((t) => t.qty > 0)).toBe(true);
  });

  it("schedules tranche 0 now (day 0) and the rest at interval steps", () => {
    const plan = buildStagedEntryPlan({ fullQty: 9, trancheCount: 3, intervalDays: 7 });
    if (!plan) return;
    expect(plan.tranches.map((t) => t.offsetDays)).toEqual([0, 7, 14]);
    expect(plan.tranches.every((t) => t.status === "pending")).toBe(true);
  });

  it("handles a single tranche (no staging) as the whole position now", () => {
    const plan = buildStagedEntryPlan({ fullQty: 5, trancheCount: 1 });
    if (!plan) return;
    expect(plan.tranches).toHaveLength(1);
    expect(plan.tranches[0].qty).toBe(5);
    expect(plan.tranches[0].offsetDays).toBe(0);
  });

  it("returns null for a non-positive qty or an invalid tranche count", () => {
    expect(buildStagedEntryPlan({ fullQty: 0, trancheCount: 3 })).toBeNull();
    expect(buildStagedEntryPlan({ fullQty: 9, trancheCount: 0 })).toBeNull();
  });

  it("uses the documented defaults when params are omitted", () => {
    const plan = buildStagedEntryPlan({ fullQty: 9 });
    if (!plan) return;
    expect(plan.trancheCount).toBe(STAGED_ENTRY_DEFAULTS.trancheCount);
    expect(plan.intervalDays).toBe(STAGED_ENTRY_DEFAULTS.intervalDays);
    expect(plan.driftBandPct).toBe(STAGED_ENTRY_DEFAULTS.driftBandPct);
  });
});

describe("plan helpers", () => {
  const plan = buildStagedEntryPlan({ fullQty: 9, trancheCount: 3 })!;

  it("nextPendingTranche returns the first un-filled tranche, or null when complete", () => {
    expect(nextPendingTranche(plan)?.index).toBe(0);
    const filledFirst = {
      ...plan,
      tranches: plan.tranches.map((t) =>
        t.index === 0 ? { ...t, status: "filled" as const } : t,
      ),
    };
    expect(nextPendingTranche(filledFirst)?.index).toBe(1);
    const allFilled = {
      ...plan,
      tranches: plan.tranches.map((t) => ({ ...t, status: "filled" as const })),
    };
    expect(nextPendingTranche(allFilled)).toBeNull();
  });

  it("stagedPlanFilledQty sums only the filled tranches", () => {
    const oneFilled = {
      ...plan,
      tranches: plan.tranches.map((t) =>
        t.index === 0 ? { ...t, status: "filled" as const } : t,
      ),
    };
    expect(stagedPlanFilledQty(oneFilled)).toBeCloseTo(3);
  });
});

describe("trancheConditionText", () => {
  const plan = buildStagedEntryPlan({ fullQty: 9, trancheCount: 3, intervalDays: 5, driftBandPct: 0.05 })!;

  it("frames the first tranche as an immediate entry and the rest as conditional adds", () => {
    expect(trancheConditionText(plan, plan.tranches[0])).toMatch(/now/i);
    const later = trancheConditionText(plan, plan.tranches[1]);
    expect(later).toMatch(/day\s*5/i);
    expect(later).toMatch(/±5%|5%/);
  });
});
