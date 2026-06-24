import { RoutinesList } from "@/components/routines-list";
import { Card, PageTitle } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { HEARTBEAT, ROUTINES } from "@/lib/routines";

export default function RoutinesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Routines"
        subtitle="Scheduled engine jobs. Run-now and scheduling are stubbed this phase."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge tone={HEARTBEAT.healthy ? "gain" : "loss"} dot>
              {HEARTBEAT.healthy ? "HEALTHY" : "STALLED"}
            </Badge>
            <span className="text-sm font-medium text-fg">
              Dead-man switch
            </span>
          </div>
          <span className="text-xs text-fg-muted">
            Last heartbeat {formatDateTime(HEARTBEAT.lastBeat)}
          </span>
        </div>
      </Card>

      <RoutinesList routines={ROUTINES} />
    </div>
  );
}
