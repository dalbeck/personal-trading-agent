import { EquityCurve } from "@/components/charts/equity-curve";
import { DataSourceNotice } from "@/components/data-source-notice";
import { Card, PageTitle, StatCard } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  formatCurrency,
  formatPercent,
  toneForValue,
} from "@/lib/format";
import { getPaperAccount } from "@/lib/server/account";

// Reads live paper data / mutable local files; never cache at build time.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { snapshot: snap, source, notice } = await getPaperAccount();

  if (!snap) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageTitle title="Overview" />
        <Card className="border-dashed">
          <p className="text-sm text-fg-muted">
            No paper snapshot found in <code>data/snapshots/</code>.
          </p>
        </Card>
      </div>
    );
  }

  const beatsBenchmark = snap.benchmark
    ? snap.benchmark.portfolioReturnPct - snap.benchmark.benchmarkReturnPct
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Overview"
        subtitle="Paper account snapshot, equity curve, and benchmark."
      />

      <DataSourceNotice notice={notice} />

      <section
        aria-label="Account summary"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <StatCard label="Equity" value={formatCurrency(snap.equity)} />
        <StatCard
          label="Total P&L"
          value={formatCurrency(snap.totalPl, { signed: true })}
          delta={formatPercent(snap.totalPlPct)}
          tone={toneForValue(snap.totalPl)}
        />
        <StatCard
          label="Day P&L"
          value={formatCurrency(snap.dayPl, { signed: true })}
          delta={formatPercent(snap.dayPlPct)}
          tone={toneForValue(snap.dayPl)}
        />
        <StatCard
          label="Buying power"
          value={formatCurrency(snap.buyingPower)}
        />
      </section>

      <section className="mt-6">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-fg">Equity curve</h2>
              <p className="text-xs text-fg-muted">
                Since inception · paper account
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="inline-flex items-center gap-2 text-fg-muted">
                <span aria-hidden className="h-0.5 w-4 rounded bg-accent" />
                Portfolio
              </span>
              <span className="inline-flex items-center gap-2 text-fg-muted">
                <span
                  aria-hidden
                  className="h-0 w-4 border-t-2 border-dashed border-fg-muted"
                />
                SPY
              </span>
            </div>
          </div>

          <EquityCurve
            points={snap.equityCurve}
            benchmarkReturnPct={snap.benchmark?.benchmarkReturnPct}
          />

          {snap.benchmark ? (
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums">
              <span className="text-fg-muted">
                Portfolio{" "}
                <span
                  className={
                    toneForValue(snap.benchmark.portfolioReturnPct) === "loss"
                      ? "text-loss"
                      : "text-gain"
                  }
                >
                  {formatPercent(snap.benchmark.portfolioReturnPct)}
                </span>
              </span>
              <span className="text-fg-muted">
                {snap.benchmark.symbol}{" "}
                <span
                  className={
                    toneForValue(snap.benchmark.benchmarkReturnPct) === "loss"
                      ? "text-loss"
                      : "text-gain"
                  }
                >
                  {formatPercent(snap.benchmark.benchmarkReturnPct)}
                </span>
              </span>
              {beatsBenchmark !== null ? (
                <span className="text-fg-muted">
                  vs benchmark{" "}
                  <span
                    className={
                      beatsBenchmark >= 0 ? "text-gain" : "text-loss"
                    }
                  >
                    {formatPercent(beatsBenchmark)}
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}
        </Card>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Badge tone="accent" dot>
              PAPER
            </Badge>
            <h2 className="text-sm font-semibold text-fg">Paper account</h2>
            <span className="ml-auto text-xs text-fg-muted">
              {source === "alpaca" ? "Live · Alpaca" : "Sample data"}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-fg-muted">Equity</dt>
            <dd className="text-right tabular-nums text-fg">
              {formatCurrency(snap.equity)}
            </dd>
            <dt className="text-fg-muted">Cash</dt>
            <dd className="text-right tabular-nums text-fg">
              {formatCurrency(snap.cash)}
            </dd>
            <dt className="text-fg-muted">Open positions</dt>
            <dd className="text-right tabular-nums text-fg">
              {snap.positions.length}
            </dd>
          </dl>
        </Card>

        <Card className="opacity-80">
          <div className="mb-3 flex items-center gap-2">
            <Badge tone="muted" dot>
              LIVE
            </Badge>
            <h2 className="text-sm font-semibold text-fg-muted">
              Live account
            </h2>
          </div>
          <p className="text-pretty text-sm text-fg-muted">
            Not connected. Real-money execution is out of scope for Phase 1 and
            stays behind a two-gate human approval.
          </p>
        </Card>
      </section>
    </div>
  );
}
