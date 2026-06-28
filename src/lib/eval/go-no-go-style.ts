import type { GoNoGoVerdict } from "@/lib/eval/go-no-go";

/**
 * Presentation for the cost-aware GO / NO-GO / NOT-YET decision panel. Colors are
 * **semantic status tones** (see `.agents/design-system.md` → "Status & verdict
 * colors"), never the brand accent: GO → success, NO-GO → danger, NOT-YET →
 * warning (still gathering sample — not a fail). Readable text on a light tint of
 * the same hue at ≥4.5:1 in both themes.
 */
export const goNoGoStyle: Record<
  GoNoGoVerdict,
  { label: string; className: string; tone: "gain" | "loss" | "neutral" }
> = {
  GO: {
    label: "GO",
    className: "border-success-border bg-success-surface text-success",
    tone: "gain",
  },
  "NO-GO": {
    label: "NO-GO",
    className: "border-danger-border bg-danger-surface text-danger",
    tone: "loss",
  },
  "NOT-YET": {
    label: "NOT-YET",
    className: "border-warning-border bg-warning-surface text-warning",
    tone: "neutral",
  },
};
