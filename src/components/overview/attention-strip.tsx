import Link from "next/link";
import { Card } from "@/components/page-shell";
import type { AttentionCounts } from "@/lib/server/overview";

/**
 * "Needs you" strip at the top of the Overview. Surfaces the three things that
 * may need a human: proposals awaiting review, orders blocked today, and
 * stalled routines. When everything is at zero it collapses to a calm
 * all-clear, never an alarm.
 */
export function AttentionStrip({ attention }: { attention: AttentionCounts }) {
  const { pendingReview, blockedToday, stalledRoutines } = attention;
  const total = pendingReview + blockedToday + stalledRoutines;

  if (total === 0) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex size-6 items-center justify-center rounded-pill bg-gain/15 text-sm font-bold text-gain"
          >
            ✓
          </span>
          <div>
            <p className="text-sm font-semibold text-fg">All clear</p>
            <p className="text-xs text-fg-muted">
              Nothing needs you right now — no pending reviews, blocks, or
              stalled routines.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
        Needs you
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <AttentionItem
          count={pendingReview}
          label="Awaiting review"
          hint="proposals to approve or reject"
          href="/proposals"
          tone={pendingReview > 0 ? "accent" : "calm"}
        />
        <AttentionItem
          count={blockedToday}
          label="Blocked today"
          hint="orders stopped by rules / red-team"
          href="/journal"
          tone={blockedToday > 0 ? "alert" : "calm"}
        />
        <AttentionItem
          count={stalledRoutines}
          label="Stalled routines"
          hint="routines whose last run errored"
          href="/routines"
          tone={stalledRoutines > 0 ? "alert" : "calm"}
        />
      </div>
    </Card>
  );
}

function AttentionItem({
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
        : "text-fg-muted";
  const ring =
    tone === "calm"
      ? "border-line"
      : tone === "alert"
        ? "border-loss/40"
        : "border-accent/40";
  return (
    <Link
      href={href}
      className={`group flex items-center gap-3 rounded-card border ${ring} bg-surface p-3 transition-[transform,background-color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-surface-overlay`}
    >
      <span className={`text-2xl font-semibold tabular-nums ${countClass}`}>
        {count}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg group-hover:underline">
          {label}
        </span>
        <span className="block text-pretty text-xs text-fg-muted">{hint}</span>
      </span>
    </Link>
  );
}
