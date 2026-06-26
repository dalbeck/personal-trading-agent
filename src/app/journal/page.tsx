import { HeroCard, HeroMetric, HeroStat } from "@/components/hero-card";
import { JournalList } from "@/components/journal/journal-list";
import { ViewingBadge } from "@/components/mode-scope";
import { Card, PageTitle } from "@/components/page-shell";
import { readJournal } from "@/lib/server/data";
import { getViewMode } from "@/lib/server/mode";

export const dynamic = "force-dynamic";

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
          <JournalList entries={entries} />
        </div>
      )}
    </div>
  );
}
