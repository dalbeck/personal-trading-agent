import { EquityCurve } from "@/components/charts/equity-curve";
import { DataSourceNotice } from "@/components/data-source-notice";
import { Card, PageTitle, StatCard } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  formatCurrency,
  formatPercent,
  toneForValue,
} from "@/lib/format";
import { getLiveAccount, getPaperAccount } from "@/lib/server/account";
import { getLiveTradingStatus } from "@/lib/server/gate";

// Reads live paper data / mutable local files; never cache at build time.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { snapshot: snap, source, notice } = await getPaperAccount();
  const live = await getLiveAccount();
  const gate = await getLiveTradingStatus();

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

        <Card className={gate.liveEnabled ? "" : "opacity-80"}>
          <div className="mb-3 flex items-center gap-2">
            <Badge tone={gate.liveEnabled ? "gain" : "muted"} dot>
              LIVE
            </Badge>
            <h2
              className={`text-sm font-semibold ${
                gate.liveEnabled ? "text-fg" : "text-fg-muted"
              }`}
            >
              Live account
            </h2>
            <span className="ml-auto text-xs font-semibold tabular-nums">
              <span className={gate.liveEnabled ? "text-gain" : "text-fg-muted"}>
                {gate.liveEnabled
                  ? "LIVE TRADING: ON"
                  : "LIVE TRADING: OFF"}
              </span>
            </span>
          </div>

          <dl className="mb-3 grid grid-cols-1 gap-1.5 rounded-card border border-line bg-surface p-3 text-xs">
            <GateRow
              label="Broker gate"
              hint="Agentic account allows agent trading"
              open={gate.brokerGateOpen}
            />
            <GateRow
              label="Harness gate"
              hint="order tools allow-listed in settings.json"
              open={gate.harnessGateOpen}
            />
            {gate.disconnected ? (
              <p className="mt-1 text-loss">
                Disconnect halt latched — live trading is held OFF.
              </p>
            ) : null}
          </dl>

          {live.snapshot ? (
            <>
              {live.notice ? (
                <p className="mb-3 text-pretty text-xs text-fg-muted">
                  {live.notice}
                </p>
              ) : (
                <p className="mb-3 text-xs text-fg-muted">
                  Robinhood Agentic · read-only
                </p>
              )}
              <dl className="grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-fg-muted">Equity</dt>
                <dd className="text-right tabular-nums text-fg">
                  {formatCurrency(live.snapshot.equity)}
                </dd>
                <dt className="text-fg-muted">Cash</dt>
                <dd className="text-right tabular-nums text-fg">
                  {formatCurrency(live.snapshot.cash)}
                </dd>
                <dt className="text-fg-muted">Open positions</dt>
                <dd className="text-right tabular-nums text-fg">
                  {live.snapshot.positions.length}
                </dd>
              </dl>
            </>
          ) : (
            <p className="text-pretty text-sm text-fg-muted">
              {live.notice ??
                "Not connected. Real-money execution stays behind a two-gate human approval."}
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}

/** One row of the two-gate status: a green check when open, a muted dash when
 *  closed. Both gates must be open for live trading. */
function GateRow({
  label,
  hint,
  open,
}: {
  label: string;
  hint: string;
  open: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className={`inline-flex size-4 items-center justify-center rounded-pill text-[10px] font-bold ${
          open
            ? "bg-gain/15 text-gain"
            : "bg-fg-muted/10 text-fg-muted"
        }`}
      >
        {open ? "✓" : "–"}
      </span>
      <span className={open ? "font-medium text-fg" : "text-fg-muted"}>
        {label}
      </span>
      <span className="ml-auto text-right text-fg-muted">
        {open ? "open" : "closed"}
        <span className="sr-only"> — {hint}</span>
      </span>
    </div>
  );
}
