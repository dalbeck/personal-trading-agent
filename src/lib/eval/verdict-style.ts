import type { VerdictKind } from "@/lib/eval/scorecard";

/**
 * Presentation for the advisory verdict, shared by the Overview "Evaluation
 * gate" module and the full `/evaluation` scorecard so the two never drift.
 *
 * Colors are **semantic status tones** (see `.agents/design-system.md` →
 * "Status & verdict colors"), never the lime accent: Go-candidate → success,
 * Iterate → warning, No-go → danger, Incomplete → neutral/muted. Each renders
 * readable text on a light tint of the same hue at ≥4.5:1 in both themes.
 */
export const verdictStyle: Record<
  VerdictKind,
  { label: string; className: string }
> = {
  "go-candidate": {
    label: "GO candidate",
    className:
      "border-success-border bg-success-surface text-success",
  },
  iterate: {
    label: "Iterate",
    className:
      "border-warning-border bg-warning-surface text-warning",
  },
  "no-go": {
    label: "No-go",
    className: "border-danger-border bg-danger-surface text-danger",
  },
  incomplete: {
    label: "Incomplete",
    className: "border-line bg-surface-overlay text-fg-muted",
  },
};
