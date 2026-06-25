import { RoutinesList } from "@/components/routines-list";
import { Card, PageTitle } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import {
  ROUTINE_CATALOG,
  type RoutineRun,
  type RunStatus,
} from "@/lib/routines";
import { readLatestRunByRoutine, readRunLogs } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function RoutinesPage() {
  const [latest, allLogs] = await Promise.all([
    readLatestRunByRoutine(),
    readRunLogs(),
  ]);

  const routines: RoutineRun[] = ROUTINE_CATALOG.map((r) => {
    const log = latest[r.id];
    return {
      ...r,
      lastRun: log?.startedAt ?? null,
      lastStatus: (log?.status as RunStatus) ?? "never",
    };
  });

  const lastBeat = allLogs[0]?.finishedAt ?? null;
  // Three states, not two: a desk that has simply never run is IDLE (neutral),
  // not STALLED (a red alarm) — STALLED means it ran and then errored/stopped.
  const deadman =
    lastBeat === null
      ? ({ tone: "muted", label: "IDLE" } as const)
      : allLogs[0].status !== "error"
        ? ({ tone: "gain", label: "HEALTHY" } as const)
        : ({ tone: "loss", label: "STALLED" } as const);

  return (
    <div>
      <PageTitle
        title="Routines"
        subtitle="Scheduled engine jobs (launchd). Use “Run now” to trigger one manually. Status reflects the latest run logs."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={deadman.tone} dot>
              {deadman.label}
            </Badge>
            <span className="text-sm font-medium text-fg">Dead-man switch</span>
          </div>
          <span className="text-xs text-fg-muted">
            {lastBeat
              ? `Last run ${formatDateTime(lastBeat)}`
              : "No runs yet — the desk is idle until a routine runs."}
          </span>
        </div>
      </Card>

      <RoutinesList routines={routines} />
    </div>
  );
}
