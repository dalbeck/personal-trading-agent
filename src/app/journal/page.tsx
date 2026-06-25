import { Markdown } from "@/components/markdown";
import { ViewingBadge } from "@/components/mode-scope";
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
          {isTrade && entry.manual ? (
            <Badge tone="muted">manual · live</Badge>
          ) : null}
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
  const [all, mode] = await Promise.all([readJournal(), getViewMode()]);
  const isLive = mode === "live";
  // Scope to the active book: paper = the autonomous desk's decisions; live =
  // the human's manual live trades (ingested read-only from Robinhood orders).
  const entries = all.filter((e) => e.account === mode);

  return (
    <div>
      <PageTitle
        title="Decision Journal"
        subtitle={
          isLive
            ? "Your manually-placed live trades, ingested read-only from Robinhood order history."
            : "Every trade and rejection the paper desk reasoned through, written at decision time."
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <ViewingBadge mode={mode} />
      </div>
      {entries.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-pretty text-sm text-fg-muted">
            {isLive
              ? "No manual live trades recorded yet. Sync them from the Coaching page (read-only) — the desk never places live orders."
              : "No journal entries yet."}
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
