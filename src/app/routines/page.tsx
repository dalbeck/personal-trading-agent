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
  const healthy = lastBeat !== null && allLogs[0].status !== "error";

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Routines"
        subtitle="Scheduled engine jobs (launchd). Status reflects the latest run logs."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={healthy ? "gain" : "loss"} dot>
              {healthy ? "HEALTHY" : "STALLED"}
            </Badge>
            <span className="text-sm font-medium text-fg">Dead-man switch</span>
          </div>
          <span className="text-xs text-fg-muted">
            {lastBeat ? `Last run ${formatDateTime(lastBeat)}` : "No runs yet"}
          </span>
        </div>
      </Card>

      <RoutinesList routines={routines} />
    </div>
  );
}
