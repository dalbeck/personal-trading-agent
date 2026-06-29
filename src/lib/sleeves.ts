/**
 * Display + policy helpers for a proposal's **sleeve** (sleeve-framework M1) —
 * `strategy` promoted into a first-class `style × horizon` axis. A sleeve bundles
 * everything horizon-specific (mandate, universe, rails, sizing model, red-team
 * lens, checklist, benchmark, cadence); the routing source of truth is
 * `strategy/sleeves.config.ts`. This module is the **client-safe** read layer
 * (no `server-only`), mirroring `strategy.ts` / `target-type.ts`, so the proposal
 * row, detail view, and the server pipeline all resolve the sleeve the same way.
 *
 * The two `swing-*` sleeves map 1:1 to the existing `strategy` values and behave
 * **byte-identically** — always read a proposal's sleeve through `sleeveOf`, which
 * derives one from `strategy` for records written before the field existed.
 */
import type { Strategy } from "@/lib/strategy";
import type { Horizon, Sleeve } from "@/lib/types";

export type { Horizon, Sleeve } from "@/lib/types";

/** Every sleeve, in display order (swing first — the bulk of the queue). */
export const SLEEVES: readonly Sleeve[] = [
  "swing-trend",
  "swing-value",
  "position-mid",
  "core-long",
] as const;

/** Short badge label per sleeve. The swing labels are deliberately identical to
 *  the old `strategy` badge ("Trend" / "Value") so swing rows are unchanged. */
export const SLEEVE_LABEL: Record<Sleeve, string> = {
  "swing-trend": "Trend",
  "swing-value": "Value",
  "position-mid": "Position",
  "core-long": "Core",
};

/** The horizon each sleeve belongs to. */
export const SLEEVE_HORIZON: Record<Sleeve, Horizon> = {
  "swing-trend": "swing",
  "swing-value": "swing",
  "position-mid": "mid",
  "core-long": "long",
};

/** Short label per horizon — used for the horizon chip. */
export const HORIZON_LABEL: Record<Horizon, string> = {
  swing: "Swing",
  mid: "Mid",
  long: "Long",
};

/** The horizon of a sleeve. */
export function horizonOf(sleeve: Sleeve): Horizon {
  return SLEEVE_HORIZON[sleeve];
}

/** Back-compat: the sleeve implied by a legacy `strategy` value. `value` is the
 *  value sleeve; everything else (incl. null/older records) is the trend sleeve. */
export function strategyToSleeve(
  strategy: Strategy | null | undefined,
): Sleeve {
  return strategy === "value" ? "swing-value" : "swing-trend";
}

/** The trend/value lens a sleeve is judged under by the **shared** checklist +
 *  red-team machinery. The swing sleeves round-trip exactly; the new sleeves map
 *  to the closest existing lens until M3 / M4 give them their own (they are
 *  disabled until then, so this is only a placeholder for the inert path):
 *  `position-mid` leads on trend (+ fundamentals), `core-long` on value/quality. */
export function sleeveToStrategy(sleeve: Sleeve): Strategy {
  switch (sleeve) {
    case "swing-value":
    case "core-long":
      return "value";
    case "swing-trend":
    case "position-mid":
      return "trend";
  }
}

/** The canonical read for a proposal's sleeve. Prefers an explicit `sleeve`, and
 *  falls back to the sleeve derived from `strategy` for records written before
 *  the field existed (a null/legacy record reads as `swing-trend`). Always go
 *  through this — never read `proposal.sleeve` raw. */
export function sleeveOf(p: {
  sleeve?: Sleeve | null;
  strategy?: Strategy | null;
}): Sleeve {
  return p.sleeve ?? strategyToSleeve(p.strategy);
}
