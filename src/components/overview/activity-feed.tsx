import { ModuleCard, ModuleEmpty } from "@/components/overview/module-card";
import { formatDateTime } from "@/lib/format";
import type { ActivityItem } from "@/lib/server/overview";

/**
 * Latest activity — a compact, newest-first feed of fills, journal entries,
 * and rejections from `data/decision-journal/`. Each row carries its timestamp
 * so you can see the desk's recent decisions at a glance.
 */
export function ActivityFeed({ activity }: { activity: ActivityItem[] }) {
  return (
    <ModuleCard
      title="Latest activity"
      subtitle="Recent fills, journal entries, and rejections"
      href="/journal"
    >
      {activity.length === 0 ? (
        <ModuleEmpty
          message="No activity yet — fills and journal entries appear here as routines run."
          cta={{ href: "/operations", label: "Run a routine from Operations" }}
        />
      ) : (
        <ul className="flex flex-col">
          {activity.map((item) => {
            const dot =
              item.tone === "gain"
                ? "bg-gain"
                : item.tone === "loss"
                  ? "bg-loss"
                  : "bg-fg-muted/60";
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 border-b border-line py-2.5 last:border-0"
              >
                <span aria-hidden className={`size-2 shrink-0 rounded-pill ${dot}`} />
                <span className="w-14 shrink-0 font-semibold text-fg">
                  {item.symbol}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm tabular-nums text-fg-muted">
                  {item.detail}
                </span>
                <time
                  className="shrink-0 text-xs tabular-nums text-fg-muted"
                  dateTime={item.timestamp}
                >
                  {formatDateTime(item.timestamp)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </ModuleCard>
  );
}
