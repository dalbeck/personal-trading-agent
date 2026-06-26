import { CoachingList } from "@/components/coaching/coaching-list";
import { CoachingStanding } from "@/components/coaching/coaching-standing";
import { ViewingBadge } from "@/components/mode-scope";
import { Card, PageTitle } from "@/components/page-shell";
import { RunHint } from "@/components/run-hint";
import { SyncLiveTradesButton } from "@/components/sync-live-trades-button";
import { readCoachingLog } from "@/lib/server/data";
import { getViewMode } from "@/lib/server/mode";

export const dynamic = "force-dynamic";

export default async function CoachingPage() {
  const [all, mode] = await Promise.all([readCoachingLog(), getViewMode()]);
  const isLive = mode === "live";
  // Coaching stays behavior-driven: paper = the autonomous desk's own calls;
  // live = reviews of the human's manually-placed live trades (ingested
  // read-only from Robinhood order history). Scope to the active book.
  const entries = all.filter((e) => e.account === mode);

  return (
    <div>
      <PageTitle
        title="Coaching Log"
        subtitle={
          isLive
            ? "Reviews of your manual live trades — graded against what actually happened."
            : "Next-morning self-reviews grading the paper desk's prior calls against what actually happened."
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ViewingBadge mode={mode} />
        {isLive ? (
          <>
            <span className="text-xs text-fg-muted">
              Manual live trades ingested read-only from Robinhood order history.
            </span>
            <span className="ml-auto">
              <SyncLiveTradesButton />
            </span>
          </>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-pretty text-sm text-fg-muted">
            {isLive
              ? "No live-trade coaching yet. Step 1: “Sync live trades” pulls your manual Robinhood fills into the Journal (read-only). Step 2: the Weekly review routine grades them here. The desk never places these trades — you do."
              : "No coaching entries yet."}
          </p>
          <RunHint
            message="Coaching is written by the Weekly review routine — it hasn't run yet."
            href="/routines"
            cta="Run Weekly review →"
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          <CoachingStanding entries={entries} />
          <CoachingList entries={entries} />
        </div>
      )}
    </div>
  );
}
