import { PageTitle } from "@/components/page-shell";
import { formatDateTime } from "@/lib/format";
import { RECENT_LOGS, type LogLevel } from "@/lib/logs";

const levelClass: Record<LogLevel, string> = {
  info: "text-fg-muted",
  warn: "text-loss/80",
  error: "text-loss",
};

export default function LogsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        title="Logs"
        subtitle="Recent routine run output. Sample data this phase."
      />

      <div className="overflow-x-auto rounded-card border border-line bg-surface-raised p-4">
        <ul className="flex flex-col gap-1 font-mono text-xs leading-relaxed">
          {RECENT_LOGS.map((line, i) => (
            <li key={i} className="flex flex-wrap gap-x-3 whitespace-nowrap">
              <time className="text-fg-muted" dateTime={line.timestamp}>
                {formatDateTime(line.timestamp)}
              </time>
              <span className="text-fg">[{line.routine}]</span>
              <span className={`uppercase ${levelClass[line.level]}`}>
                {line.level}
              </span>
              <span className="whitespace-normal text-fg">{line.message}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
