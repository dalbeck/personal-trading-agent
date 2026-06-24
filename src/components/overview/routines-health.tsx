import { ModuleCard } from "@/components/overview/module-card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import type { RunStatus } from "@/lib/routines";
import type { RoutinesHealth } from "@/lib/server/overview";

const statusMeta: Record<RunStatus, { label: string; dot: string; text: string }> =
  {
    ok: { label: "OK", dot: "bg-gain", text: "text-gain" },
    error: { label: "Error", dot: "bg-loss", text: "text-loss" },
    skipped: { label: "Skipped", dot: "bg-fg-muted/60", text: "text-fg-muted" },
    locked: { label: "Locked", dot: "bg-fg-muted/60", text: "text-fg-muted" },
    never: { label: "Never run", dot: "bg-fg-muted/40", text: "text-fg-muted" },
  };

/**
 * Routines & health — the five scheduled routines with last-run status and
 * cadence, plus the dead-man-switch heartbeat and lock status. Mirrors the
 * Routines page so the Overview and that view never disagree.
 */
export function RoutinesHealthModule({
  health,
}: {
  health: RoutinesHealth;
}) {
  const { routines, healthy, lastBeat, locked } = health;

  return (
    <ModuleCard
      title="Routines & health"
      subtitle="Scheduled engine jobs + dead-man switch"
      href="/routines"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface p-3">
        <div className="flex items-center gap-2">
          <Badge tone={healthy ? "gain" : "loss"} dot>
            {healthy ? "HEALTHY" : "STALLED"}
          </Badge>
          <span className="text-sm font-medium text-fg">Dead-man switch</span>
          {locked > 0 ? (
            <Badge tone="muted">
              {locked} locked
            </Badge>
          ) : null}
        </div>
        <span className="text-xs text-fg-muted">
          {lastBeat ? `Last run ${formatDateTime(lastBeat)}` : "No runs yet"}
        </span>
      </div>

      <ul className="flex flex-col">
        {routines.map((r) => {
          const meta = statusMeta[r.lastStatus];
          return (
            <li
              key={r.id}
              className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
            >
              <span aria-hidden className={`size-2 shrink-0 rounded-pill ${meta.dot}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">
                  {r.name}
                </span>
                <span className="block truncate text-xs text-fg-muted">
                  Next: {r.schedule}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block text-xs font-medium ${meta.text}`}>
                  {meta.label}
                </span>
                <span className="block text-xs tabular-nums text-fg-muted">
                  {r.lastRun ? formatDateTime(r.lastRun) : "—"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </ModuleCard>
  );
}
