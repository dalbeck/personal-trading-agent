import { Badge } from "@/components/ui/badge";
import { MODE_LABEL, type ViewMode } from "@/lib/mode";

/**
 * Small "you are viewing X" badge for labelling a panel's scope. PAPER reads as
 * the accent proving-ground; LIVE reads muted + "read-only" so it never looks
 * like an armed/executing surface.
 */
export function ViewingBadge({
  mode,
  readOnly = mode === "live",
}: {
  mode: ViewMode;
  readOnly?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={mode === "live" ? "muted" : "accent"} dot>
        {MODE_LABEL[mode].toUpperCase()}
      </Badge>
      {readOnly ? (
        <span className="text-xs text-fg-muted">read-only</span>
      ) : null}
    </span>
  );
}

/**
 * A scope clarifier shown in **Live** view above desk-behavior modules. The
 * evaluation gate, guardrails, routine health, and activity all reflect the
 * PAPER desk — the autonomous engine being proven — regardless of view mode.
 * The live book is read-only and advisory and never auto-executes.
 */
export function DeskScopeNote({ mode }: { mode: ViewMode }) {
  if (mode !== "live") return null;
  return (
    <p className="text-pretty rounded-card border border-line bg-surface-raised px-3 py-2 text-xs text-fg-muted">
      Viewing the <span className="font-semibold text-fg">live book</span> —
      read-only and advisory. Desk activity, guardrails, and the evaluation gate
      below reflect the{" "}
      <span className="font-semibold text-fg">paper desk</span> (the autonomous
      engine being proven). The live side never auto-executes.
    </p>
  );
}
