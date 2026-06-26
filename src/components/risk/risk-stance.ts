import type { RiskSettings } from "@/lib/types";

/**
 * Pure summary of the human's standing risk overrides vs the charter defaults.
 * Derives only from `settings` vs `charter` — counts customised rails and the
 * effective limit for each numeric rail. NO invented "risk score"; this is a
 * factual restatement of the rails as they stand. Presentation only; it changes
 * no rail, default, validation, or endpoint.
 *
 * A rail counts as "customised" when it is disabled OR carries a non-null
 * override value (the two ways a rail departs from its charter default).
 */

export interface RiskCharter {
  perPositionSizePct: number;
  maxOrdersPerDay: number;
  drawdownHaltPct: number;
}

export type RiskRailKey =
  | "positionSize"
  | "dailyOrderCap"
  | "drawdownHalt"
  | "stopRequired"
  | "universe";

export const ALL_RAIL_KEYS: RiskRailKey[] = [
  "positionSize",
  "dailyOrderCap",
  "drawdownHalt",
  "stopRequired",
  "universe",
];

export interface RiskStanceSummary {
  /** How many of the five rails depart from the charter default. */
  customizedCount: number;
  totalRails: number;
  /** Whether any rail is turned OFF (the loudest signal). */
  anyDisabled: boolean;
  disabledCount: number;
  /** Effective numeric limits, in friendly display units, with charter shown. */
  positionSize: EffectiveLimit;
  dailyOrderCap: EffectiveLimit;
  drawdownHalt: EffectiveLimit;
}

export interface EffectiveLimit {
  /** Charter default in storage units. */
  charter: number;
  /** Effective value in storage units (override when set, else charter). */
  effective: number;
  /** True when this rail is turned off entirely. */
  enabled: boolean;
  /** True when an explicit override value is set (departs from charter). */
  overridden: boolean;
}

function railCustomized(rail: { enabled: boolean; value: number | null }): boolean {
  return !rail.enabled || rail.value !== null;
}

function effectiveLimit(
  rail: { enabled: boolean; value: number | null },
  charter: number,
): EffectiveLimit {
  return {
    charter,
    effective: rail.value !== null ? rail.value : charter,
    enabled: rail.enabled,
    overridden: rail.value !== null,
  };
}

export function summarizeRiskStance(
  settings: RiskSettings,
  charter: RiskCharter,
): RiskStanceSummary {
  const customizedCount = ALL_RAIL_KEYS.filter((k) =>
    railCustomized(settings[k]),
  ).length;
  const disabledCount = ALL_RAIL_KEYS.filter((k) => !settings[k].enabled).length;

  return {
    customizedCount,
    totalRails: ALL_RAIL_KEYS.length,
    anyDisabled: disabledCount > 0,
    disabledCount,
    positionSize: effectiveLimit(settings.positionSize, charter.perPositionSizePct),
    dailyOrderCap: effectiveLimit(settings.dailyOrderCap, charter.maxOrdersPerDay),
    drawdownHalt: effectiveLimit(settings.drawdownHalt, charter.drawdownHaltPct),
  };
}
