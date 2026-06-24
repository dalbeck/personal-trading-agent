import { PositionsTable } from "@/components/positions-table";
import { Card, PageTitle } from "@/components/page-shell";
import { formatCurrency } from "@/lib/format";
import { readLatestSnapshot } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const snap = await readLatestSnapshot("paper");
  const positions = snap?.positions ?? [];
  const totalUnrealized = positions.reduce((s, p) => s + p.unrealizedPl, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Positions"
        subtitle={
          snap
            ? `${positions.length} open · ${formatCurrency(
                positions.reduce((s, p) => s + p.marketValue, 0),
              )} market value`
            : "Open positions with cost basis and unrealized P&L."
        }
      />

      {positions.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-fg-muted">No open positions.</p>
        </Card>
      ) : (
        <>
          <PositionsTable positions={positions} />
          <p className="mt-3 text-right text-sm tabular-nums text-fg-muted">
            Total unrealized{" "}
            <span
              className={totalUnrealized >= 0 ? "text-gain" : "text-loss"}
            >
              {formatCurrency(totalUnrealized, { signed: true })}
            </span>
          </p>
        </>
      )}
    </div>
  );
}
