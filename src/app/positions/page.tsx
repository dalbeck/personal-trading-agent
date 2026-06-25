import { DataSourceNotice } from "@/components/data-source-notice";
import { PositionsTable } from "@/components/positions-table";
import { Badge } from "@/components/ui/badge";
import { Card, PageTitle } from "@/components/page-shell";
import { formatCurrency } from "@/lib/format";
import { getLiveAccount, getPaperAccount } from "@/lib/server/account";
import type { Position } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  // Paper (Alpaca / seed) and live (Robinhood Agentic, read-only) resolve
  // independently; either may be empty without affecting the other.
  const [paper, live] = await Promise.all([getPaperAccount(), getLiveAccount()]);
  const paperPositions = paper.snapshot?.positions ?? [];
  const livePositions = live.snapshot?.positions ?? [];

  return (
    <div className="space-y-8">
      <PageTitle
        title="Positions"
        subtitle="Open positions across the paper and live accounts, with cost basis and unrealized P&L."
      />

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Badge tone="accent" dot>
            PAPER
          </Badge>
          <h2 className="text-sm font-semibold text-fg">Paper account</h2>
          <span className="ml-auto text-xs text-fg-muted">
            {paper.source === "alpaca" ? "Live · Alpaca" : "Sample data"}
          </span>
        </div>
        <DataSourceNotice notice={paper.notice} />
        <PositionsSection positions={paperPositions} emptyLabel="No open paper positions." />
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Badge tone={live.connected ? "gain" : "muted"} dot>
            LIVE
          </Badge>
          <h2
            className={`text-sm font-semibold ${
              live.connected ? "text-fg" : "text-fg-muted"
            }`}
          >
            Live account
          </h2>
          <span className="ml-auto text-xs text-fg-muted">
            Robinhood Agentic · read-only
          </span>
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
              positions={livePositions}
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
