import { HeroCard, HeroStat } from "@/components/hero-card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { CheckIcon, XIcon, FlagIcon, RoutinesIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/format";

/** The three dead-man states the page computes. Mirrors `page.tsx` exactly —
 *  IDLE (never run / neutral), HEALTHY (last run clean), STALLED (last run
 *  errored). Presentation only: the page derives this, the hero just renders it. */
export type DeadmanState = {
  tone: BadgeTone;
  label: "IDLE" | "HEALTHY" | "STALLED";
};

/** Aggregate counts across the routine catalog (derived in the page, pure
 *  presentation). Drives the at-a-glance health stat chips. */
export type RoutineHealth = {
  ok: number;
  error: number;
  never: number;
  locked: number;
};

const headline: Record<DeadmanState["label"], string> = {
  HEALTHY: "All systems nominal",
  STALLED: "A routine has stalled",
  IDLE: "Desk is idle",
};

const numberTone: Record<BadgeTone, string> = {
  gain: "text-gain",
  loss: "text-loss",
  accent: "text-accent",
  neutral: "text-fg",
  muted: "text-fg-muted",
};

/**
 * The focal surface for the Routines page: the dead-man switch status rendered
 * as a large serif state word + a tone-driven badge, the last-beat timestamp,
 * and a row of stat chips summarizing the routine fleet (ok / error / never-run
 * / locked). One dominant hero, then the slim list below it.
 */
export function RoutinesHero({
  deadman,
  lastBeat,
  health,
}: {
  deadman: DeadmanState;
  lastBeat: string | null;
  health: RoutineHealth;
}) {
  return (
    <HeroCard surface="surface-hero-accent">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex flex-col gap-3">
            <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
              <RoutinesIcon className="size-3.5" aria-hidden />
              Dead-man switch
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <h2
                className={`font-serif text-[2.5rem] font-semibold leading-none md:text-[2.75rem] ${numberTone[deadman.tone]}`}
              >
                {deadman.label}
              </h2>
              <Badge tone={deadman.tone} dot solid>
                {headline[deadman.label]}
              </Badge>
            </div>
            <p className="text-sm text-fg-muted">
              {lastBeat
                ? `Last run ${formatDateTime(lastBeat)}`
                : "No runs yet — the desk is idle until a routine runs."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HeroStat
            label="Healthy"
            value={String(health.ok)}
            tone={health.ok > 0 ? "gain" : "neutral"}
            icon={CheckIcon}
          />
          <HeroStat
            label="Errored"
            value={String(health.error)}
            tone={health.error > 0 ? "loss" : "neutral"}
            icon={XIcon}
          />
          <HeroStat
            label="Never run"
            value={String(health.never)}
            icon={FlagIcon}
          />
          <HeroStat
            label="Locked"
            value={String(health.locked)}
            icon={RoutinesIcon}
          />
        </div>
      </div>
    </HeroCard>
  );
}
