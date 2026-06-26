import { HeroCard, HeroMetric, HeroStat } from "@/components/hero-card";
import { Markdown } from "@/components/markdown";
import { ViewingBadge } from "@/components/mode-scope";
import { Card, PageTitle } from "@/components/page-shell";
import { TickerLink } from "@/components/ticker-link";
import { Badge } from "@/components/ui/badge";
import {
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "@/components/icons";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { groupByDay } from "@/lib/group";
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
  const buy = isTrade && entry.action === "buy";
  const Icon = !isTrade ? XIcon : buy ? TrendingUpIcon : TrendingDownIcon;
  const tint = !isTrade
    ? "bg-fg-muted/10 text-fg-muted"
    : buy
      ? "bg-gain/12 text-gain"
      : "bg-loss/12 text-loss";
  return (
    <Card interactive>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className={`grid size-9 shrink-0 place-items-center rounded-[12px] ${tint}`}
          >
            <Icon className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <TickerLink
                symbol={entry.symbol}
                className="font-semibold text-fg"
              />
              {isTrade && entry.manual ? (
                <Badge tone="muted">manual · live</Badge>
              ) : null}
            </div>
            <span className="text-sm tabular-nums text-fg-muted">
              {isTrade
                ? `${entry.action.toUpperCase()} ${entry.qty} @ ${formatCurrency(entry.price)}`
                : `Rejected · ${entry.proposedAction} · ${rejectedByLabel[entry.rejectedBy]}`}
            </span>
          </div>
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
  const tradeCount = entries.filter((e) => e.kind === "trade").length;
  const rejectionCount = entries.length - tradeCount;

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
        <div className="flex flex-col gap-8">
          <HeroCard>
            <div className="mb-6 flex items-center gap-2">
              <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
                {isLive ? "Live trade log" : "Desk decisions"}
              </h2>
              <span className="ml-auto text-xs text-fg-muted">
                {entries.length} logged
              </span>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.05fr_1.5fr] lg:items-center">
              <HeroMetric
                label="Decisions logged"
                value={String(entries.length)}
              />
              <div className="grid grid-cols-2 gap-3">
                <HeroStat label="Trades" value={String(tradeCount)} />
                <HeroStat
                  label={isLive ? "Other" : "Rejections"}
                  value={String(rejectionCount)}
                />
              </div>
            </div>
          </HeroCard>
          {groupByDay(entries, (e) => e.timestamp).map(({ key, items }) => (
            <section key={key}>
              <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                {formatDate(key)}
              </h2>
              <div className="flex flex-col gap-4">
                {items.map((e) => (
                  <EntryCard key={e.id} entry={e} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
