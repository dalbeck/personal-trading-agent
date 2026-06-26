import { PageTitle } from "@/components/page-shell";
import { LogsStats } from "@/components/logs/logs-stats";
import { LogsList } from "@/components/logs/logs-list";
import { LogsIcon } from "@/components/icons";
import { readRunLogs } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = await readRunLogs();

  return (
    <div>
      <PageTitle
        title="Logs"
        subtitle="Structured run logs from the scheduled routines (data/logs/)."
      />

      {logs.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-surface-raised p-6">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent/10 text-accent"
            >
              <LogsIcon className="size-[18px]" />
            </span>
            <p className="text-pretty text-sm text-fg-muted">
              No run logs yet.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <LogsStats logs={logs} />
          <LogsList logs={logs} />
        </div>
      )}
    </div>
  );
}
