import { Badge } from "@/components/ui/badge";
import { MODE_LABEL, type ViewMode } from "@/lib/mode";
import type { Ownership } from "@/lib/universe";

/**
 * Auto-surfacing badge: marks a symbol that is part of the tracked universe.
 * `held` (owned in the active book) reads as the accent proving-ground tone;
 * `watchlist` reads muted. `none` renders nothing.
 */
export function OwnershipBadge({ ownership }: { ownership: Ownership }) {
  if (ownership === "none") return null;
  return ownership === "held" ? (
    <Badge tone="accent" dot>
      Held
    </Badge>
  ) : (
    <Badge tone="muted" dot>
      Watchlist
    </Badge>
  );
}

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
 * A scope clarifier shown in **Live** view above the desk-behavior modules.
 * Live is the desk's focus and is human-approved per trade; the evaluation gate
 * + guardrails below are the secondary **paper proving-ground**.
 */
export function DeskScopeNote({ mode }: { mode: ViewMode }) {
  if (mode !== "live") return null;
  return (
    <p className="text-pretty rounded-card border border-line bg-surface-raised px-3 py-2 text-xs text-fg-muted">
      Viewing the <span className="font-semibold text-fg">live book</span> — the
      desk&apos;s focus. You approve each trade; nothing is placed without your
      approval (while the order gate is closed, an approval routes to the paper
      dry-run sink). The evaluation gate + guardrails below are the secondary{" "}
      <span className="font-semibold text-fg">paper proving-ground</span>.
    </p>
  );
}
