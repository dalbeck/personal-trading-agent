import { Markdown } from "@/components/markdown";
import { ViewingBadge } from "@/components/mode-scope";
import { Card, PageTitle } from "@/components/page-shell";
import { SyncLiveTradesButton } from "@/components/sync-live-trades-button";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { readCoachingLog } from "@/lib/server/data";
import { getViewMode } from "@/lib/server/mode";
import type { CoachingEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

const gradeTone: Record<CoachingEntry["grade"], BadgeTone> = {
  A: "gain",
  B: "gain",
  C: "muted",
  D: "loss",
  F: "loss",
};

function EntryCard({ entry }: { entry: CoachingEntry }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge tone={gradeTone[entry.grade]}>Grade {entry.grade}</Badge>
          <span className="text-sm text-fg-muted capitalize">
            {entry.period}
          </span>
          {entry.symbol ? (
            <span className="font-semibold text-fg">{entry.symbol}</span>
          ) : null}
        </div>
        <time className="text-xs text-fg-muted" dateTime={entry.date}>
          {formatDate(entry.date)}
        </time>
      </div>

      <Markdown source={entry.body} className="mt-3 text-sm text-fg" />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex flex-wrap gap-1.5">
          {entry.relatedJournalIds.map((id) => (
            <span
              key={id}
              className="rounded-pill bg-surface-overlay px-2 py-0.5 text-xs text-fg-muted"
            >
              {id}
            </span>
          ))}
        </div>
        {entry.promotedToPlaybook ? (
          <Badge tone="accent">Promoted to playbook</Badge>
        ) : null}
      </div>
    </Card>
  );
}

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
              ? "No live-trade coaching yet. Use “Sync live trades” to pull your manual Robinhood fills into the journal, then the review routine can grade them. The desk never places these trades — you do."
              : "No coaching entries yet."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {entries.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}
