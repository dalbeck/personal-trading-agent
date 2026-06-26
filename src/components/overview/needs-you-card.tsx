import Link from "next/link";
import { Card } from "@/components/page-shell";
import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import type { AttentionCounts } from "@/lib/server/overview";

/**
 * "Needs you" — the prominent actionable sidebar card on the Overview (M1
 * reference rebuild). Surfaces the three things that may need a human: proposals
 * awaiting review, orders blocked today, and stalled routines, as big tappable
 * rows (serif count + label + chevron). When everything is at zero it collapses
 * to a calm all-clear, never an alarm.
 */
export function NeedsYouCard({ attention }: { attention: AttentionCounts }) {
  const { pendingReview, blockedToday, stalledRoutines } = attention;
  const total = pendingReview + blockedToday + stalledRoutines;

  return (
    <Card className="flex flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
          Needs you
        </h2>
        {total === 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gain">
            <span
              aria-hidden
              className="inline-flex size-4 items-center justify-center rounded-pill bg-gain/15"
            >
              <CheckIcon className="size-3" />
            </span>
            All clear
          </span>
        ) : (
          <span className="text-xs text-fg-muted">{total} open</span>
        )}
      </div>

      {total === 0 ? (
        <p className="text-pretty text-sm text-fg-muted">
          Nothing needs you right now — no pending reviews, blocks, or stalled
          routines.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <NeedsRow
            count={pendingReview}
            label="Awaiting review"
            hint="proposals to approve or reject"
            href="/proposals"
            tone={pendingReview > 0 ? "accent" : "calm"}
          />
          <NeedsRow
            count={blockedToday}
            label="Blocked today"
            hint="orders stopped by rules / red-team"
            href="/journal"
            tone={blockedToday > 0 ? "alert" : "calm"}
          />
          <NeedsRow
            count={stalledRoutines}
            label="Stalled routines"
            hint="routines whose last run errored"
            href="/routines"
            tone={stalledRoutines > 0 ? "alert" : "calm"}
          />
        </div>
      )}
    </Card>
  );
}

function NeedsRow({
  count,
  label,
  hint,
  href,
  tone,
}: {
  count: number;
  label: string;
  hint: string;
  href: string;
  tone: "accent" | "alert" | "calm";
}) {
  const countClass =
    tone === "accent"
      ? "text-accent"
      : tone === "alert"
        ? "text-loss"
        : "text-fg-subtle";
  const ring =
    tone === "calm"
      ? "border-line"
      : tone === "alert"
        ? "border-loss/35"
        : "border-accent/35";
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3.5 rounded-card border ${ring} bg-surface p-3.5 transition-[transform,background-color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-surface-overlay`}
    >
      <span
        className={`min-w-[1.5ch] font-serif text-[1.75rem] font-semibold leading-none tabular-nums ${countClass}`}
      >
        {count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-fg group-hover:underline">
          {label}
        </span>
        <span className="block text-pretty text-xs text-fg-muted">{hint}</span>
      </span>
      <ChevronRightIcon
        className={`size-4 shrink-0 transition-transform group-hover:translate-x-0.5 ${
          tone === "calm" ? "text-fg-subtle" : countClass
        }`}
        aria-hidden
      />
    </Link>
  );
}
