import { DataSourceNotice } from "@/components/data-source-notice";
import { LiveRefreshButton } from "@/components/live-refresh-button";
import { ViewingBadge } from "@/components/mode-scope";
import { PositionsTable } from "@/components/positions-table";
import { Card, PageTitle } from "@/components/page-shell";
import { formatCurrency } from "@/lib/format";
import { MODE_LABEL, otherMode } from "@/lib/mode";
import { getLiveAccount, getPaperAccount } from "@/lib/server/account";
import { getViewMode } from "@/lib/server/mode";
import type { Position } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  // Both books resolve independently (both engines run); the view mode only
  // picks which one is the primary section. Paper = Alpaca/seed; live =
  // Robinhood Agentic, read-only.
  const [paper, live, mode] = await Promise.all([
    getPaperAccount(),
    getLiveAccount(),
    getViewMode(),
  ]);
  const isLive = mode === "live";
  const otherLabel = MODE_LABEL[otherMode(mode)];
  const otherPositions =
    (isLive ? paper.snapshot : live.snapshot)?.positions ?? [];

  return (
    <div className="space-y-8">
      <PageTitle
        title="Positions"
        subtitle={
          isLive
            ? "Open positions in the live Robinhood Agentic account — read-only."
            : "Open positions in the paper account, with cost basis and unrealized P&L."
        }
      />

      {isLive ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <ViewingBadge mode="live" />
            <h2
              className={`text-sm font-semibold ${
                live.connected ? "text-fg" : "text-fg-muted"
              }`}
            >
              Live account
            </h2>
            <div className="ml-auto flex items-center gap-3">
              <span className="text-xs text-fg-muted">
                Robinhood Agentic · read-only
              </span>
              {live.connected ? (
                <LiveRefreshButton asOf={live.snapshot?.asOf} />
              ) : null}
            </div>
          </div>
          {/* Privacy: the Robinhood MCP can read every linked account, but the
              desk surfaces ONLY the Agentic account — it never enumerates or
              displays the others. */}
          <p className="mb-3 text-xs text-fg-muted">
            Agentic account only — other Robinhood accounts are never read.
          </p>
          {live.connected ? (
            <>
              <DataSourceNotice notice={live.notice} />
              <PositionsSection
                positions={live.snapshot?.positions ?? []}
                emptyLabel="No open live positions."
              />
            </>
          ) : (
            <Card className="border-dashed">
              <p className="text-pretty text-sm text-fg-muted">
                {live.notice ??
                  "Robinhood Agentic account not connected — live trading is off."}
              </p>
            </Card>
          )}
        </section>
      ) : (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <ViewingBadge mode="paper" />
            <h2 className="text-sm font-semibold text-fg">Paper account</h2>
            <span className="ml-auto text-xs text-fg-muted">
              {paper.source === "alpaca" ? "Live · Alpaca" : "Sample data"}
            </span>
          </div>
          <DataSourceNotice notice={paper.notice} />
          <PositionsSection
            positions={paper.snapshot?.positions ?? []}
            emptyLabel="No open paper positions."
          />
        </section>
      )}

      {/* Subtle reminder that the other book is also tracked — toggle to view. */}
      <p className="text-xs text-fg-muted">
        {otherLabel} book also tracked
        {isLive
          ? ` · ${otherPositions.length} paper position${
              otherPositions.length === 1 ? "" : "s"
            }`
          : live.connected
            ? ` · ${otherPositions.length} live position${
                otherPositions.length === 1 ? "" : "s"
              }`
            : " · live not connected"}
        . Use the header toggle to switch.
      </p>
    </div>
  );
}

/** Positions table + unrealized-P&L total, or a dashed empty card. */
function PositionsSection({
  positions,
  emptyLabel,
}: {
  positions: Position[];
  emptyLabel: string;
}) {
  if (positions.length === 0) {
    return (
      <Card className="border-dashed">
        <p className="text-sm text-fg-muted">{emptyLabel}</p>
      </Card>
    );
  }
  const totalUnrealized = positions.reduce((s, p) => s + p.unrealizedPl, 0);
  return (
    <>
      <PositionsTable positions={positions} />
      <p className="mt-3 text-right text-sm tabular-nums text-fg-muted">
        Total unrealized{" "}
        <span className={totalUnrealized >= 0 ? "text-gain" : "text-loss"}>
          {formatCurrency(totalUnrealized, { signed: true })}
        </span>
      </p>
    </>
  );
}
