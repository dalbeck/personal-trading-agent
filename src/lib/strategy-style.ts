import type { BadgeTone } from "@/components/ui/badge";
import type { Strategy } from "@/lib/strategy";
import { HORIZON_LABEL, SLEEVE_LABEL, horizonOf } from "@/lib/sleeves";
import type { Horizon, Sleeve } from "@/lib/sleeves";

/**
 * Presentation for the strategy badge (value-sleeve M1), shared so the proposal
 * row, detail modal, and any future surface read the mandate the same way.
 *
 * The strategy is a **mandate label, not a pass/warn/fail status**, so it does
 * NOT use the semantic gain/loss or success/danger tones (those carry trading
 * or verdict meaning). The default `trend` reads quietly (muted) since it is the
 * bulk of the queue; the deliberately-separate `value` sleeve gets the accent
 * token so the second mandate is visually distinct at a glance.
 */
export const strategyStyle: Record<
  Strategy,
  { label: string; tone: BadgeTone }
> = {
  trend: { label: "Trend", tone: "muted" },
  value: { label: "Value", tone: "accent" },
};

/**
 * Presentation for the **sleeve** badge (sleeve-framework M1) — the proposal
 * badge now reads the sleeve, not the bare strategy. The two swing sleeves keep
 * the old strategy badge exactly (`Trend` muted / `Value` accent), so swing rows
 * are visually unchanged; the new horizons get the accent token so a non-swing
 * mandate is distinct at a glance once they ship.
 */
export const sleeveStyle: Record<Sleeve, { label: string; tone: BadgeTone }> = {
  "swing-trend": { label: SLEEVE_LABEL["swing-trend"], tone: "muted" },
  "swing-value": { label: SLEEVE_LABEL["swing-value"], tone: "accent" },
  "position-mid": { label: SLEEVE_LABEL["position-mid"], tone: "accent" },
  "core-long": { label: SLEEVE_LABEL["core-long"], tone: "accent" },
};

/**
 * Presentation for the **horizon** chip (sleeve-framework M1) — a quiet,
 * secondary label that sits next to the sleeve badge so the holding horizon
 * (Swing / Mid / Long) is glanceable without crowding the sleeve mandate. Always
 * `muted` — the horizon is context, not a verdict.
 */
export function horizonChip(sleeve: Sleeve): { label: string; tone: BadgeTone } {
  const horizon: Horizon = horizonOf(sleeve);
  return { label: HORIZON_LABEL[horizon], tone: "muted" };
}
