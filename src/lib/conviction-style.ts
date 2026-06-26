import type { BadgeTone } from "@/components/ui/badge";
import type { ConvictionTier } from "@/lib/conviction";

/**
 * Presentation for the conviction tier badge (M1), shared so the proposal row,
 * detail modal, and any future surface read the tier the same way.
 *
 * The tier is a **conviction ranking, not a pass/warn/fail status**, so it does
 * NOT use the semantic gain/loss or success/danger tones (those carry trading or
 * verdict meaning). It reads as a calm intensity gradient on sanctioned tokens:
 * `high` → accent-bordered (the strongest setups), `moderate` → neutral,
 * `watch` → muted. Every tier still renders — the badge sorts/labels, it never
 * hides.
 */
export const convictionTierStyle: Record<
  ConvictionTier,
  { label: string; tone: BadgeTone }
> = {
  high: { label: "High conviction", tone: "accent" },
  moderate: { label: "Moderate", tone: "neutral" },
  watch: { label: "Watch", tone: "muted" },
};
