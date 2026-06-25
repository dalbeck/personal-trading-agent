import { Markdown } from "@/components/markdown";
import { Card, PageTitle } from "@/components/page-shell";
import { TickerLink } from "@/components/ticker-link";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { readJournal } from "@/lib/server/data";
import { getViewMode } from "@/lib/server/mode";
import type { JournalEntry } from "@/lib/types";

export const dynamic = "force-dynamic";

const rejectedByLabel: Record<string, string> = {
  "codex-redteam": "Codex red-team",
  rules: "Charter rules",
  human: "Human",
};

function EntryCard({ entry }: { entry: JournalEntry }) {
  const isTrade = entry.kind === "trade";
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isTrade ? (
            <Badge tone={entry.action === "buy" ? "gain" : "loss"}>
              {entry.action.toUpperCase()}
            </Badge>
          ) : (
            <Badge tone="muted">REJECTED</Badge>
          )}
          <TickerLink symbol={entry.symbol} className="font-semibold text-fg" />
          {isTrade ? (
            <span className="text-sm tabular-nums text-fg-muted">
              {entry.qty} @ {formatCurrency(entry.price)}
            </span>
          ) : (
            <span className="text-sm text-fg-muted">
              {entry.proposedAction} · {rejectedByLabel[entry.rejectedBy]}
            </span>
          )}
        </div>
        <time className="text-xs text-fg-muted" dateTime={entry.timestamp}>
          {formatDateTime(entry.timestamp)}
        </time>
      </div>

      <Markdown source={entry.body} className="mt-3 text-sm text-fg" />

      {isTrade && (entry.stopPrice !== null || entry.takeProfit !== null) ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-fg-muted">
          {entry.stopPrice !== null ? (
            <span>Stop {formatCurrency(entry.stopPrice)}</span>
          ) : null}
          {entry.takeProfit !== null ? (
            <span>Target {formatCurrency(entry.takeProfit)}</span>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map((t) => (
            <span
              key={t}
              className="rounded-pill bg-surface-overlay px-2 py-0.5 text-xs text-fg-muted"
            >
              {t}
            </span>
          ))}
        </div>
        <span className="text-xs text-fg-muted">
          Review {formatDate(entry.reviewDate)}
        </span>
      </div>
    </Card>
  );
}

export default async function JournalPage() {
  const [entries, mode] = await Promise.all([readJournal(), getViewMode()]);

  return (
    <div>
      <PageTitle
        title="Decision Journal"
        subtitle="Every trade and rejection the desk reasoned through, written at decision time."
      />
      {/* Behavior-driven (not ownership-driven): the journal records the desk's
          own decisions, so it is the autonomous paper desk's record regardless
          of view mode. Live trades you place manually aren't journaled here. */}
      <p className="mb-4 text-pretty text-xs text-fg-muted">
        {mode === "live"
          ? "Showing the desk's decision record (paper desk). Live trades you place manually in Robinhood are not journaled here."
          : "The autonomous paper desk's decision record."}
      </p>
      {entries.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-fg-muted">No journal entries yet.</p>
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
