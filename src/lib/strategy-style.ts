import type { BadgeTone } from "@/components/ui/badge";
import type { Strategy } from "@/lib/strategy";

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
