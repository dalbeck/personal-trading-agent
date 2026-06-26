import type { RedTeamFactor, RedTeamVerdict } from "@/lib/types";

/**
 * Presentation for the red-team verdict + its structured factors, shared by the
 * proposal card and the approve dialog so the two never drift.
 *
 * Colours are **semantic status tones** (see `.agents/design-system.md` →
 * "Status & verdict colors"), never the blue accent: approve → success,
 * concern → warning, reject → danger. Each renders readable text on a light tint
 * of the same hue at ≥4.5:1 in both themes (the same tokens the evaluation
 * verdict uses).
 */
export const redTeamVerdictStyle: Record<
  RedTeamVerdict["verdict"],
  { label: string; className: string; callout: string }
> = {
  approve: {
    label: "Approve",
    className: "border-success-border bg-success-surface text-success",
    // Callout block (proposal card / dialog): a verdict-tinted surface with a
    // colored left rail so the red-team reads as a distinct zone, not body copy.
    callout: "border-success-border border-l-success bg-success-surface/40",
  },
  concern: {
    label: "Concern",
    className: "border-warning-border bg-warning-surface text-warning",
    callout: "border-warning-border border-l-warning bg-warning-surface/40",
  },
  reject: {
    label: "Reject",
    className: "border-danger-border bg-danger-surface text-danger",
    callout: "border-danger-border border-l-danger bg-danger-surface/40",
  },
};

/**
 * Per-factor stance from the prosecutor's adversarial view: `refutes` is an
 * objection (danger), `supports` held up (success), `neutral` is mixed (muted).
 * The dot tints the factor; the label is a screen-reader-friendly description.
 */
export const factorStanceStyle: Record<
  RedTeamFactor["stance"],
  { label: string; dot: string }
> = {
  supports: { label: "Supports", dot: "bg-success" },
  refutes: { label: "Refutes", dot: "bg-danger" },
  neutral: { label: "Mixed", dot: "bg-fg-muted/50" },
};
