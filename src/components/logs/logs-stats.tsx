import { HeroCard, HeroMetric, HeroStat } from "@/components/hero-card";
import { KpiCard } from "@/components/overview/kpi-card";
import { CheckIcon, FlagIcon, ProposalsIcon } from "@/components/icons";
import { formatDateTime } from "@/lib/format";
import type { RunLog } from "@/lib/types";

/**
 * The focal run-stats strip for the Logs audit view: a HeroCard anchoring the
 * total run count + on-surface error/skip stats, over an enriched KPI grid
 * (proposals considered · orders placed · rejections) with serif numbers and
 * tinted icons. Pure presentation — every figure is summed straight from the
 * RunLog records that the page already read; nothing is synthesized.
 */
export function LogsStats({ logs }: { logs: RunLog[] }) {
  const runs = logs.length;
  const errors = logs.filter((l) => l.status === "error").length;
  const skipped = logs.filter(
    (l) => l.status === "skipped" || l.status === "locked",
  ).length;
  const proposalsConsidered = sum(logs, (l) => l.proposalsConsidered);
  const ordersPlaced = sum(logs, (l) => l.ordersPlaced);
  const rejections = sum(logs, (l) => l.rejections);

  // "Most recent" is the latest startedAt across the shown logs — a real
  // anchor for the audit window, never a fabricated "today".
  const latest = logs.reduce<string | null>((acc, l) => {
    if (!acc) return l.startedAt;
    return l.startedAt > acc ? l.startedAt : acc;
  }, null);

  return (
    <div className="flex flex-col gap-5">
      <HeroCard>
        <div className="flex flex-col gap-6">
          <HeroMetric
            label="Routine runs logged"
            value={String(runs)}
            tone="neutral"
          />
          {latest ? (
            <p className="text-xs text-fg-muted">
              Most recent run {formatDateTime(latest)}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <HeroStat
              label="Clean runs"
              value={String(runs - errors - skipped)}
              tone="neutral"
            />
            <HeroStat
              label="Errored"
              value={String(errors)}
              tone={errors > 0 ? "loss" : "neutral"}
            />
            <HeroStat
              label="Skipped / locked"
              value={String(skipped)}
              tone="neutral"
            />
          </div>
        </div>
      </HeroCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label="Proposals considered"
          value={String(proposalsConsidered)}
          icon={ProposalsIcon}
          tone="neutral"
        />
        <KpiCard
          label="Orders placed"
          value={String(ordersPlaced)}
          icon={CheckIcon}
          tone={ordersPlaced > 0 ? "gain" : "neutral"}
        />
        <KpiCard
          label="Rejections"
          value={String(rejections)}
          icon={FlagIcon}
          tone={rejections > 0 ? "loss" : "neutral"}
        />
      </div>
    </div>
  );
}

function sum(logs: RunLog[], pick: (l: RunLog) => number): number {
  return logs.reduce((acc, l) => acc + pick(l), 0);
}
