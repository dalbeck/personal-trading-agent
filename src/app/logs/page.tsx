import { PageTitle } from "@/components/page-shell";
import { formatDateTime } from "@/lib/format";
import type { RunLog } from "@/lib/types";
import { readRunLogs } from "@/lib/server/data";

export const dynamic = "force-dynamic";

const statusClass: Record<RunLog["status"], string> = {
  ok: "text-gain",
  error: "text-loss",
  skipped: "text-fg-muted",
  locked: "text-fg-muted",
};

export default async function LogsPage() {
  const logs = await readRunLogs();

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        title="Logs"
        subtitle="Structured run logs from the scheduled routines (data/logs/)."
      />

      {logs.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-4 text-sm text-fg-muted">
          No run logs yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface-raised p-4">
          <ul className="flex flex-col gap-1 font-mono text-xs leading-relaxed">
            {logs.map((log, i) => (
              <li key={i} className="flex flex-wrap gap-x-3 whitespace-nowrap">
                <time className="text-fg-muted" dateTime={log.startedAt}>
                  {formatDateTime(log.startedAt)}
                </time>
                <span className="text-fg">[{log.routine}]</span>
                <span className={`uppercase ${statusClass[log.status]}`}>
                  {log.status}
                </span>
                <span className="whitespace-normal text-fg">{log.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
