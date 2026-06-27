/**
 * Staged-entry (DCA / scale-in) plan (staged-entry-plan M2). An OPTIONAL plan on
 * a proposal — most useful for the value / mean-reversion sleeve — that splits
 * the **full intended position** into tranches with a schedule + a drift
 * condition (e.g. 1/3 now; ~5 days later add another if price is within ±5% of
 * the prior fill; repeat until filled, then hold).
 *
 * Two honest invariants:
 * - **Risk is sized on the FULL position.** The plan only *splits* the proposal's
 *   already-sized full quantity into tranches — the stop and the ≤2% risk rail
 *   apply to the fully-filled position, so completing every tranche is never
 *   over-risked. The tranche qtys sum back to the full qty exactly.
 * - **No auto-execution.** The plan is the *suggested* schedule + conditions;
 *   the human approves each tranche through the normal gated per-trade approval
 *   when it is due. The agent never fires the schedule itself.
 *
 * DCA reduces *timing* risk, not market risk — averaging into a decliner can
 * average into a loss. It is an execution choice, not a guarantee.
 *
 * Plain module (no `server-only`) so the client table + the server attach/approve
 * paths share one definition. Pure + unit-tested.
 */
import type { StagedEntryPlan, StagedTranche } from "@/lib/types";

/** Documented defaults (staged-entry-plan M2) — human-tunable when attaching a
 *  plan: 3 tranches, ~5 trading days apart, add only within a ±5% drift band. */
export const STAGED_ENTRY_DEFAULTS = {
  trancheCount: 3,
  intervalDays: 5,
  driftBandPct: 0.05,
} as const;

export interface BuildStagedEntryPlanInput {
  /** The proposal's full intended position (the already-sized quantity). */
  fullQty: number;
  trancheCount?: number;
  intervalDays?: number;
  /** The ±band (fraction) the price must stay within vs the prior fill to add. */
  driftBandPct?: number;
  /** Fractional shares allowed (charter: yes). Default true. */
  allowFractional?: boolean;
}

/** Round a quantity to the share precision (4dp fractional, else whole). */
function roundQty(qty: number, allowFractional: boolean): number {
  return allowFractional ? Math.floor(qty * 1e4) / 1e4 : Math.floor(qty);
}

/**
 * Build a staged-entry plan that splits `fullQty` into `trancheCount` equal
 * tranches. Any rounding remainder lands on the **last** tranche so the tranche
 * quantities sum back to `fullQty` exactly (never over- or under-size the
 * fully-filled position). Tranche 0 is scheduled now (day 0); the rest at
 * `intervalDays` steps. Returns null for a non-positive qty or an invalid count.
 */
export function buildStagedEntryPlan(
  input: BuildStagedEntryPlanInput,
): StagedEntryPlan | null {
  const trancheCount = Math.floor(input.trancheCount ?? STAGED_ENTRY_DEFAULTS.trancheCount);
  const intervalDays = input.intervalDays ?? STAGED_ENTRY_DEFAULTS.intervalDays;
  const driftBandPct = input.driftBandPct ?? STAGED_ENTRY_DEFAULTS.driftBandPct;
  const allowFractional = input.allowFractional ?? true;
  if (!(input.fullQty > 0) || trancheCount < 1) return null;

  const fraction = 1 / trancheCount;
  const per = roundQty(input.fullQty / trancheCount, allowFractional);
  if (!(per > 0)) {
    // Too few shares to split — degrade to a single tranche of the whole qty.
    return {
      trancheCount: 1,
      intervalDays,
      driftBandPct,
      tranches: [
        { index: 0, fraction: 1, qty: input.fullQty, offsetDays: 0, status: "pending" },
      ],
    };
  }

  const tranches: StagedTranche[] = [];
  let allocated = 0;
  for (let i = 0; i < trancheCount; i++) {
    const last = i === trancheCount - 1;
    // The last tranche takes the exact remainder so the sum is exact.
    const qty = last
      ? roundQty(input.fullQty - allocated, allowFractional)
      : per;
    allocated += qty;
    tranches.push({
      index: i,
      fraction,
      qty,
      offsetDays: i * intervalDays,
      status: "pending",
    });
  }

  return { trancheCount, intervalDays, driftBandPct, tranches };
}

/** Total planned quantity across all tranches (≈ the full position). */
export function stagedPlanTotalQty(plan: StagedEntryPlan): number {
  return plan.tranches.reduce((sum, t) => sum + t.qty, 0);
}

/** Quantity already filled (sum of `filled` tranches). */
export function stagedPlanFilledQty(plan: StagedEntryPlan): number {
  return plan.tranches
    .filter((t) => t.status === "filled")
    .reduce((sum, t) => sum + t.qty, 0);
}

/** The next un-filled (pending) tranche due, or null when the plan is complete. */
export function nextPendingTranche(plan: StagedEntryPlan): StagedTranche | null {
  return plan.tranches.find((t) => t.status === "pending") ?? null;
}

/** Human-readable schedule + condition for one tranche. */
export function trancheConditionText(
  plan: StagedEntryPlan,
  tranche: StagedTranche,
): string {
  if (tranche.index === 0) {
    return "Enter now (first tranche)";
  }
  const band = Math.round(plan.driftBandPct * 100);
  return `~Day ${tranche.offsetDays} — add if price is within ±${band}% of the prior fill`;
}
