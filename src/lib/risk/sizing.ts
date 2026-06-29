/**
 * Position sizing models (per-sleeve-rails M2). A sleeve's `sizingModel` selects
 * how a position's share `qty` is derived:
 *
 * - **`risk-to-stop`** (swing, position-mid) — size from the stop distance so the
 *   loss to the stop is ≤ the per-position risk cap, then clamp by the per-position
 *   size cap. This is the desk's original model, extracted here verbatim from
 *   `buildManualProposalDraft` so both the builder and any new caller share one
 *   source of truth.
 * - **`target-weight`** (core-long) — size to a target portfolio **weight** (a
 *   fraction of equity), with no stop distance required, clamped by the same
 *   per-position size cap so a target weight can never exceed the sleeve's size rail.
 *
 * Both floor (never round) the raw quantity so a rounding artefact can never push
 * an order back *over* a cap; fractional shares keep 4 dp.
 */

/** Floor a raw share count: 4 dp for fractional, whole shares otherwise. */
export function floorQty(rawQty: number, allowFractional: boolean): number {
  return allowFractional ? Math.floor(rawQty * 1e4) / 1e4 : Math.floor(rawQty);
}

export interface RiskToStopSizingInput {
  equity: number;
  entry: number;
  /** Per-share risk to the protective stop (`entry − stop` for a long). > 0. */
  riskPerShare: number;
  perPositionRiskPct: number;
  perPositionSizePct: number;
  allowFractional?: boolean;
}

/**
 * Risk-to-stop sizing — the tighter of "≤ risk% of equity at the stop" and
 * "≤ size% of equity in the name". Returns 0 for degenerate inputs (caller treats
 * a non-positive qty as "no trade"). Math is identical to the original builder.
 */
export function sizeRiskToStop(input: RiskToStopSizingInput): number {
  const { equity, entry, riskPerShare } = input;
  if (!(equity > 0) || !(entry > 0) || !(riskPerShare > 0)) return 0;
  const qtyByRisk = (equity * input.perPositionRiskPct) / riskPerShare;
  const qtyBySize = (equity * input.perPositionSizePct) / entry;
  const rawQty = Math.min(qtyByRisk, qtyBySize);
  return floorQty(rawQty, input.allowFractional ?? true);
}

export interface TargetWeightSizingInput {
  equity: number;
  entry: number;
  /** Desired share of the portfolio for this position, a fraction (0.4 === 40%). */
  targetWeightPct: number;
  /** The sleeve's per-position size cap — the target weight is clamped to it so
   *  sizing can never exceed the size rail. */
  perPositionSizePct: number;
  allowFractional?: boolean;
}

/**
 * Target-weight sizing — size to a target portfolio weight, bounded by the
 * sleeve's per-position size cap (and, downstream, by the live exposure envelope).
 * No stop distance involved. Returns 0 for degenerate inputs.
 */
export function sizeByTargetWeight(input: TargetWeightSizingInput): number {
  const { equity, entry } = input;
  if (!(equity > 0) || !(entry > 0) || !(input.targetWeightPct > 0)) return 0;
  // Clamp the target weight to the sleeve's size cap so the order can't exceed it.
  const weight = Math.min(input.targetWeightPct, input.perPositionSizePct);
  const rawQty = (equity * weight) / entry;
  return floorQty(rawQty, input.allowFractional ?? true);
}
