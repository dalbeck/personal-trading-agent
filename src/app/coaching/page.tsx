import { Markdown } from "@/components/markdown";
import { Card, PageTitle } from "@/components/page-shell";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { readCoachingLog } from "@/lib/server/data";
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
  const entries = await readCoachingLog();

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Coaching Log"
        subtitle="Next-morning self-reviews grading prior calls against what actually happened."
      />
      {entries.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-fg-muted">No coaching entries yet.</p>
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
