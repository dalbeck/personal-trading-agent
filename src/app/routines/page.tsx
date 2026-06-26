import { RoutinesList } from "@/components/routines-list";
import { RoutinesHero } from "@/components/routines/routines-hero";
import { PageTitle, SectionTitle } from "@/components/page-shell";
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

  // At-a-glance fleet health for the hero stat chips — pure presentation
  // aggregation over the routines list (no logic / data change).
  const health = {
    ok: routines.filter((r) => r.lastStatus === "ok").length,
    error: routines.filter((r) => r.lastStatus === "error").length,
    never: routines.filter((r) => r.lastStatus === "never").length,
    locked: routines.filter((r) => r.lastStatus === "locked").length,
  };

  return (
    <div className="flex flex-col gap-8">
      <PageTitle
        title="Routines"
        subtitle="Scheduled engine jobs (launchd). Use “Run now” to trigger one manually. Status reflects the latest run logs."
      />

      <RoutinesHero deadman={deadman} lastBeat={lastBeat} health={health} />

      <section className="flex flex-col gap-4">
        <SectionTitle
          title="Scheduled routines"
          note="Each job’s cadence and latest run status. Needs-attention routines surface first."
        />
        <RoutinesList routines={routines} />
      </section>
    </div>
  );
}
