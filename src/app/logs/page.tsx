import { PageTitle } from "@/components/page-shell";
import { formatDate } from "@/lib/format";
import { groupByDay } from "@/lib/group";
import type { RunLog } from "@/lib/types";
import { readRunLogs } from "@/lib/server/data";

export const dynamic = "force-dynamic";

const statusPill: Record<RunLog["status"], string> = {
  ok: "bg-gain/12 text-gain",
  error: "bg-loss/12 text-loss",
  skipped: "bg-fg-muted/10 text-fg-muted",
  locked: "bg-fg-muted/10 text-fg-muted",
};

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

function StatusPill({ status }: { status: RunLog["status"] }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-pill px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide ${statusPill[status]}`}
    >
      {status}
    </span>
  );
}

export default async function LogsPage() {
  const logs = await readRunLogs();
  const groups = groupByDay(logs, (l) => l.startedAt);

  return (
    <div>
      <PageTitle
        title="Logs"
        subtitle="Structured run logs from the scheduled routines (data/logs/)."
      />

      {logs.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-4 text-sm text-fg-muted">
          No run logs yet.
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(({ key, items }) => (
            <section key={key}>
              <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {formatDate(key)}
              </h2>
              <ul className="overflow-hidden rounded-card border border-line">
                {items.map((log, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 border-b border-line bg-surface-raised px-4 py-3.5 last:border-0"
                  >
                    <StatusPill status={log.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-fg">
                          {log.routine}
                        </span>
                        <time
                          className="shrink-0 text-xs tabular-nums text-fg-muted"
                          dateTime={log.startedAt}
                        >
                          {timeFmt.format(new Date(log.startedAt))}
                        </time>
                      </div>
                      <p className="mt-0.5 text-pretty text-sm text-fg-muted">
                        {log.summary}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
