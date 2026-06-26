import type { ComponentType, SVGProps } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { CheckIcon, FlagIcon, ProposalsIcon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { groupByDay } from "@/lib/group";
import type { RunLog } from "@/lib/types";

type Status = RunLog["status"];

const statusTone: Record<Status, BadgeTone> = {
  ok: "gain",
  error: "loss",
  skipped: "muted",
  locked: "muted",
};

const statusLabel: Record<Status, string> = {
  ok: "OK",
  error: "Error",
  skipped: "Skipped",
  locked: "Locked",
};

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

/**
 * The audit trail as a slim, date-grouped table (.agents/design-system.md →
 * "Slim date-grouped table"): rows live inside a composed rounded card
 * (border + divide-y) under serif day headers with an entry count. Each row is
 * a status pill · serif routine name · right-aligned time, over a muted summary
 * line and right-aligned count chips for the run's proposals / orders /
 * rejections (a chip shows only when its value is > 0). Server-rendered,
 * presentation only — `groupByDay` is unchanged and no data is derived.
 */
export function LogsList({ logs }: { logs: RunLog[] }) {
  const groups = groupByDay(logs, (l) => l.startedAt);

  return (
    <div className="flex flex-col gap-7">
      {groups.map((group) => (
        <section key={group.key}>
          <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
            <h3 className="font-serif text-sm font-semibold text-fg">
              {formatDate(group.key)}
            </h3>
            <span className="text-xs tabular-nums text-fg-muted">
              {group.items.length}
              {group.items.length === 1 ? " run" : " runs"}
            </span>
          </div>
          <div className="divide-y divide-line/70 overflow-hidden rounded-card border border-line bg-surface">
            {group.items.map((log, i) => (
              <LogRow key={`${log.routine}-${log.startedAt}-${i}`} log={log} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function LogRow({ log }: { log: RunLog }) {
  const hasCounts =
    log.proposalsConsidered > 0 ||
    log.ordersPlaced > 0 ||
    log.rejections > 0;

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      {/* Primary line — status pill · serif routine · right-aligned time */}
      <div className="flex items-center gap-2.5">
        <Badge tone={statusTone[log.status]} dot>
          {statusLabel[log.status]}
        </Badge>
        <span className="truncate font-serif text-base font-semibold text-fg">
          {log.routine}
        </span>
        <time
          className="ml-auto shrink-0 text-xs tabular-nums text-fg-muted"
          dateTime={log.startedAt}
        >
          {timeFmt.format(new Date(log.startedAt))} ET
        </time>
      </div>

      {/* Secondary — muted summary + right-aligned count chips */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-0.5">
        <p className="min-w-0 flex-1 text-pretty text-sm text-fg-muted">
          {log.summary}
        </p>
        {hasCounts ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            {log.proposalsConsidered > 0 ? (
              <CountChip
                icon={ProposalsIcon}
                label="considered"
                value={log.proposalsConsidered}
              />
            ) : null}
            {log.ordersPlaced > 0 ? (
              <CountChip
                icon={CheckIcon}
                label="placed"
                value={log.ordersPlaced}
                tone="gain"
              />
            ) : null}
            {log.rejections > 0 ? (
              <CountChip
                icon={FlagIcon}
                label="rejected"
                value={log.rejections}
                tone="loss"
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const chipTone = {
  neutral: "border-line text-fg-muted",
  gain: "border-gain/40 text-gain",
  loss: "border-loss/40 text-loss",
} as const;

/** A small right-aligned count chip: tinted icon + tabular value + muted label. */
function CountChip({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  value: number;
  tone?: keyof typeof chipTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border bg-surface px-2.5 py-0.5 text-xs ${chipTone[tone]}`}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-fg-muted">{label}</span>
    </span>
  );
}
