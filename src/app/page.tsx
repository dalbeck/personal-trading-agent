import { EquityCurve } from "@/components/charts/equity-curve";
import { DataSourceNotice } from "@/components/data-source-notice";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { AttentionStrip } from "@/components/overview/attention-strip";
import { AwaitingReview } from "@/components/overview/awaiting-review";
import { EvalSnapshotModule } from "@/components/overview/eval-snapshot";
import { GuardrailHeadroom } from "@/components/overview/guardrail-headroom";
import { RoutinesHealthModule } from "@/components/overview/routines-health";
import { Card, PageTitle, StatCard } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { DeskScopeNote } from "@/components/mode-scope";
import { LiveRefreshButton } from "@/components/live-refresh-button";
import {
  formatCurrency,
  formatPercent,
  formatQty,
  toneForValue,
} from "@/lib/format";
import { MODE_LABEL } from "@/lib/mode";
import { getLiveAccount, getPaperAccount } from "@/lib/server/account";
import { getLiveTradingStatus } from "@/lib/server/gate";
import { liveDrawdown } from "@/lib/server/live-guards";
import { getViewMode } from "@/lib/server/mode";
import { getTrackedUniverse } from "@/lib/server/universe";
import { getOverviewModules } from "@/lib/server/overview";
import { LIVE_LIMITS } from "@strategy/charter.config";

// Reads live paper data / mutable local files; never cache at build time.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { snapshot: snap, source, notice } = await getPaperAccount();
  const [live, gate, modules, mode] = await Promise.all([
    getLiveAccount(),
    getLiveTradingStatus(),
    getOverviewModules(snap),
    getViewMode(),
  ]);
  const universe = await getTrackedUniverse(mode);

  // The view mode picks which book the hero KPIs + equity curve render. Both
  // books are still fetched (both engines run); this only switches the display.
  // The desk-behavior modules below stay paper-scoped (the autonomous engine).
  const isLive = mode === "live";
  const hero = isLive
    ? {
        snapshot: live.snapshot,
        notice: live.notice,
        sourceLabel: live.connected
          ? "Robinhood Agentic · read-only"
          : "Not connected",
        readOnly: true,
      }
    : {
        snapshot: snap,
        notice,
        sourceLabel: source === "alpaca" ? "Live · Alpaca" : "Sample data",
        readOnly: false,
      };
  const heroSnap = hero.snapshot;

  // Live pilot caps (M4) for the LIVE panel — configured limits, with current
  // exposure/drawdown when a real live snapshot is present.
  const dd = live.snapshot ? liveDrawdown(live.snapshot) : null;
  const liveCaps = {
    weeklyFundingCapUsd: LIVE_LIMITS.weeklyFundingCapUsd,
    maxAccountExposureUsd: LIVE_LIMITS.maxAccountExposureUsd,
    drawdownKillPct: LIVE_LIMITS.drawdownKillPct,
    exposureUsd: live.snapshot
      ? live.snapshot.positions.reduce((s, p) => s + Math.max(0, p.marketValue), 0)
      : null,
    drawdownPct: dd ? dd.drawdownPct : null,
    killBreached: dd ? dd.breached : false,
  };

  const excess = heroSnap?.benchmark
    ? heroSnap.benchmark.portfolioReturnPct -
      heroSnap.benchmark.benchmarkReturnPct
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle
          title="Overview"
          subtitle={
            isLive
              ? "The live book — read-only and advisory. The paper desk keeps running underneath."
              : "What needs you, how the desk is tracking, and the guardrails it runs inside."
          }
        />
        <DataSourceNotice notice={hero.notice} />
      </div>

      <AttentionStrip attention={modules.attention} />

      <DeskScopeNote mode={mode} />

      {heroSnap ? (
        <>
          <section
            aria-label={`${MODE_LABEL[mode]} account summary`}
            className="flex flex-col gap-3"
          >
            <div className="flex items-center gap-2">
              <Badge tone={isLive ? "muted" : "accent"} dot>
                {MODE_LABEL[mode].toUpperCase()}
              </Badge>
              <h2 className="text-sm font-semibold text-fg">
                {isLive ? "Live account" : "Paper account"}
              </h2>
              {hero.readOnly ? (
                <span className="text-xs text-fg-muted">read-only</span>
              ) : null}
              <span className="ml-auto text-xs text-fg-muted">
                {hero.sourceLabel}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <StatCard label="Equity" value={formatCurrency(heroSnap.equity)} />
              <StatCard
                label="Total P&L"
                value={formatCurrency(heroSnap.totalPl, { signed: true })}
                delta={formatPercent(heroSnap.totalPlPct)}
                tone={toneForValue(heroSnap.totalPl)}
              />
              <StatCard
                label="Day P&L"
                value={formatCurrency(heroSnap.dayPl, { signed: true })}
                delta={formatPercent(heroSnap.dayPlPct)}
                tone={toneForValue(heroSnap.dayPl)}
              />
              {heroSnap.benchmark ? (
                <StatCard
                  label="vs SPY (excess)"
                  value={excess !== null ? formatPercent(excess) : "—"}
                  delta={`you ${formatPercent(
                    heroSnap.benchmark.portfolioReturnPct,
                  )} · SPY ${formatPercent(heroSnap.benchmark.benchmarkReturnPct)}`}
                  tone={excess !== null ? toneForValue(excess) : "neutral"}
                />
              ) : (
                <StatCard label="Cash" value={formatCurrency(heroSnap.cash)} />
              )}
              <StatCard
                label="Buying power"
                value={formatCurrency(heroSnap.buyingPower)}
              />
            </div>
          </section>

          {heroSnap.equityCurve.length > 1 ? (
            <section>
              <Card>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-fg">
                      Equity curve
                    </h2>
                    <p className="text-xs text-fg-muted">
                      Since inception · {mode} account
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="inline-flex items-center gap-2 text-fg-muted">
                      <span
                        aria-hidden
                        className="h-0.5 w-4 rounded bg-accent"
                      />
                      Portfolio
                    </span>
                    {heroSnap.benchmark ? (
                      <span className="inline-flex items-center gap-2 text-fg-muted">
                        <span
                          aria-hidden
                          className="h-0 w-4 border-t-2 border-dashed border-fg-muted"
                        />
                        SPY
                      </span>
                    ) : null}
                  </div>
                </div>

                <EquityCurve
                  points={heroSnap.equityCurve}
                  benchmarkReturnPct={heroSnap.benchmark?.benchmarkReturnPct}
                />
              </Card>
            </section>
          ) : null}
        </>
      ) : (
        <Card className="border-dashed">
          <p className="text-pretty text-sm text-fg-muted">
            {isLive
              ? live.connected
                ? "No live snapshot yet — use Refresh on the live card below to pull the account."
                : "Live account not connected — this view is read-only. Real-money execution stays behind a two-gate human approval."
              : "No paper snapshot found in data/snapshots/. KPIs and the equity curve appear once a snapshot is written."}
          </p>
        </Card>
      )}

      <AwaitingReview
        proposals={modules.awaitingReview}
        liveEnabled={gate.liveEnabled}
        pendingTotal={modules.attention.pendingReview}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <GuardrailHeadroom guardrails={modules.guardrails} />
        <EvalSnapshotModule evaluation={modules.evaluation} mode={mode} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ActivityFeed activity={modules.activity} universe={universe} />
        <RoutinesHealthModule health={modules.routinesHealth} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
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
          {snap ? (
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
          ) : (
            <p className="text-sm text-fg-muted">No paper snapshot yet.</p>
          )}
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
            <div className="ml-auto flex items-center gap-3">
              {live.connected ? (
                <LiveRefreshButton asOf={live.snapshot?.asOf} />
              ) : null}
              <span className="text-xs font-semibold tabular-nums">
                <span
                  className={gate.liveEnabled ? "text-gain" : "text-fg-muted"}
                >
                  {gate.liveEnabled ? "LIVE TRADING: ON" : "LIVE TRADING: OFF"}
                </span>
              </span>
            </div>
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

          <dl className="mb-3 grid grid-cols-1 gap-1.5 rounded-card border border-line bg-surface p-3 text-xs">
            <div className="mb-0.5 font-semibold uppercase tracking-wide text-fg-muted">
              Live pilot caps
            </div>
            <CapRow
              label="Weekly funding cap"
              value={formatCurrency(liveCaps.weeklyFundingCapUsd)}
            />
            <CapRow
              label="Account exposure ceiling"
              value={
                liveCaps.exposureUsd !== null
                  ? `${formatCurrency(liveCaps.exposureUsd)} / ${formatCurrency(liveCaps.maxAccountExposureUsd)}`
                  : formatCurrency(liveCaps.maxAccountExposureUsd)
              }
            />
            <CapRow
              label="Drawdown kill switch"
              value={
                liveCaps.drawdownPct !== null
                  ? `${formatPercent(-liveCaps.drawdownPct)} · trips at −${(liveCaps.drawdownKillPct * 100).toFixed(0)}%`
                  : `−${(liveCaps.drawdownKillPct * 100).toFixed(0)}% from high-water`
              }
              tone={liveCaps.killBreached ? "loss" : "muted"}
            />
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
              {live.snapshot.positions.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                  {live.snapshot.positions.map((p) => (
                    <li
                      key={p.symbol}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="font-medium text-fg">{p.symbol}</span>
                      <span className="tabular-nums text-fg-muted">
                        {formatQty(p.qty)} sh
                      </span>
                      <span className="ml-auto tabular-nums text-fg">
                        {formatCurrency(p.marketValue)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
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

/** One row of the live pilot caps: a labelled, right-aligned value. */
function CapRow({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "loss";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-fg-muted">{label}</span>
      <span
        className={`ml-auto text-right tabular-nums ${
          tone === "loss" ? "font-semibold text-loss" : "text-fg"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
