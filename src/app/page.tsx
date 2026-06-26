import { HeroEquityChart } from "@/components/charts/hero-equity-chart";
import { DataSourceNotice } from "@/components/data-source-notice";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { NeedsYouCard } from "@/components/overview/needs-you-card";
import { AwaitingReview } from "@/components/overview/awaiting-review";
import { EvalSnapshotModule } from "@/components/overview/eval-snapshot";
import { GuardrailHeadroom } from "@/components/overview/guardrail-headroom";
import { MarketRegimeCard } from "@/components/overview/regime-context";
import { RoutinesHealthModule } from "@/components/overview/routines-health";
import { KpiCard } from "@/components/overview/kpi-card";
import { Card, PageTitle, SectionTitle } from "@/components/page-shell";
import { ProgressBar } from "@/components/ui/progress";
import { CompositionRing } from "@/components/charts/composition-ring";
import { HeroCard, HeroMetric } from "@/components/hero-card";
import { RiskPostureCard } from "@/components/risk-posture-card";
import { Badge } from "@/components/ui/badge";
import { DeskScopeNote } from "@/components/mode-scope";
import { LiveRefreshButton } from "@/components/live-refresh-button";
import {
  BanknotesIcon,
  ScaleIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  ZapIcon,
} from "@/components/icons";
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
import { getEffectiveRiskConfig } from "@/lib/server/risk-settings";
import { riskPostureFromSnapshot } from "@/lib/risk-posture";
import { getTrackedUniverse } from "@/lib/server/universe";
import { getOverviewModules } from "@/lib/server/overview";
import { getRegimeContext } from "@/lib/server/regime";
import { LIVE_LIMITS } from "@strategy/charter.config";

// Reads live paper data / mutable local files; never cache at build time.
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const { snapshot: snap, source, notice } = await getPaperAccount();
  const [live, gate, modules, mode, regime, riskConfig] = await Promise.all([
    getLiveAccount(),
    getLiveTradingStatus(),
    getOverviewModules(snap),
    getViewMode(),
    getRegimeContext(),
    getEffectiveRiskConfig(),
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

  // Risk posture (M6) — a snapshot of how aggressively the ACTIVE book is
  // positioned, blended from real signals (deployment, concentration, position
  // count, risk-per-trade, drawdown) + whether a rail has been loosened.
  const posture = heroSnap
    ? riskPostureFromSnapshot(heroSnap, {
        railsLoosened: riskConfig.skipRules.length > 0,
      })
    : null;

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

  const totalPlTone = toneForValue(heroSnap?.totalPl ?? 0);
  const dayPlTone = toneForValue(heroSnap?.dayPl ?? 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <PageTitle
          title="Overview"
          subtitle={
            isLive
              ? "Your live account — the desk's focus. You approve each trade; the paper desk runs underneath as the dry-run sink."
              : "What needs you, how the desk is tracking, and the guardrails it runs inside."
          }
        />
        <DataSourceNotice notice={hero.notice} />
      </div>

      <DeskScopeNote mode={mode} />

      {/* Composed reference layout: a dominant equity hero + enriched KPIs +
          sector-rotation regime + the proposals queue in the main column, with
          the actionable "Needs you" card and the risk-posture gauge riding a
          subordinate sidebar. Hierarchy via size/weight, not a flat stack. */}
      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr] lg:items-start">
        {/* MAIN COLUMN */}
        <div className="flex flex-col gap-5">
          {heroSnap ? (
            <section aria-label={`${MODE_LABEL[mode]} account summary`}>
              <HeroCard surface="surface-hero-accent">
                <div className="mb-5 flex flex-wrap items-center gap-2">
                  <Badge tone={isLive ? "muted" : "accent"} dot>
                    {MODE_LABEL[mode].toUpperCase()}
                  </Badge>
                  {hero.readOnly ? (
                    <span className="text-xs text-fg-muted">read-only</span>
                  ) : null}
                  <span className="ml-auto text-xs text-fg-muted">
                    {hero.sourceLabel}
                  </span>
                </div>

                <HeroMetric
                  label={`Total equity · ${MODE_LABEL[mode]}`}
                  value={formatCurrency(heroSnap.equity)}
                  delta={formatCurrency(heroSnap.totalPl, { signed: true })}
                  deltaTone={totalPlTone}
                />
                <p className="mt-2 text-xs text-fg-muted">
                  All-time
                  {heroSnap.benchmark && excess !== null ? (
                    <>
                      {" · vs SPY "}
                      <span
                        className={`font-medium tabular-nums ${
                          toneForValue(excess) === "gain"
                            ? "text-gain"
                            : toneForValue(excess) === "loss"
                              ? "text-loss"
                              : "text-fg"
                        }`}
                      >
                        {formatPercent(excess)}
                      </span>
                    </>
                  ) : null}
                </p>

                {heroSnap.equityCurve.length > 1 ? (
                  <div className="mt-5">
                    <HeroEquityChart
                      points={heroSnap.equityCurve}
                      benchmarkReturnPct={heroSnap.benchmark?.benchmarkReturnPct}
                    />
                  </div>
                ) : null}
              </HeroCard>
            </section>
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

          {heroSnap ? (
            <section
              aria-label="Key metrics"
              className="grid grid-cols-2 gap-4"
            >
              <KpiCard
                label="Total P&L"
                value={formatCurrency(heroSnap.totalPl, { signed: true })}
                tone={totalPlTone}
                icon={totalPlTone === "loss" ? TrendingDownIcon : TrendingUpIcon}
                delta={formatPercent(heroSnap.totalPlPct)}
                sparkline={heroSnap.equityCurve.map((p) => p.equity)}
              />
              <KpiCard
                label="vs SPY"
                value={excess !== null ? formatPercent(excess) : "—"}
                tone={excess !== null ? toneForValue(excess) : "neutral"}
                icon={ScaleIcon}
              />
              <KpiCard
                label="Day P&L"
                value={formatCurrency(heroSnap.dayPl, { signed: true })}
                tone={dayPlTone}
                icon={ZapIcon}
                delta={formatPercent(heroSnap.dayPlPct)}
              />
              <KpiCard
                label="Cash"
                value={formatCurrency(heroSnap.cash)}
                icon={BanknotesIcon}
              />
            </section>
          ) : null}

          <MarketRegimeCard regime={regime} />

          <AwaitingReview
            proposals={modules.awaitingReview}
            liveEnabled={gate.liveEnabled}
            pendingTotal={modules.attention.pendingReview}
          />
        </div>

        {/* SIDEBAR — an at-a-glance rail: what needs you, how the book is
            positioned, and what just happened. The activity feed rides here
            (a compact vertical list) so the sidebar tracks the taller main
            column instead of leaving dead space below the gauge. */}
        <div className="flex flex-col gap-5">
          <NeedsYouCard attention={modules.attention} />
          {posture ? (
            <RiskPostureCard
              posture={posture}
              layout="stacked"
              scopeLabel={`${MODE_LABEL[mode]} book`}
            />
          ) : null}
          <ActivityFeed activity={modules.activity} universe={universe} />
        </div>
      </div>

      <SectionTitle
        title="Desk health"
        note="The guardrails the desk runs inside, its evaluation standing, and routine status."
      />

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <GuardrailHeadroom guardrails={modules.guardrails} />
        <EvalSnapshotModule evaluation={modules.evaluation} mode={mode} />
        <div className="lg:col-span-2 xl:col-span-1">
          <RoutinesHealthModule health={modules.routinesHealth} />
        </div>
      </section>

      <SectionTitle
        title="Accounts"
        note="Both books at a glance — paper (the dry-run sink) and the live Robinhood account with its pilot caps and gate state."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <Badge tone="accent" dot>
              PAPER
            </Badge>
            <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
              Paper account
            </h2>
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
              className={`font-serif text-[0.95rem] font-semibold ${
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

          <div className="mb-3 flex flex-col gap-3.5 rounded-card border border-line bg-surface p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
              Live pilot caps
            </div>
            {liveCaps.exposureUsd !== null ? (
              <ProgressBar
                label="Account exposure"
                valueText={`${formatCurrency(liveCaps.exposureUsd)} / ${formatCurrency(liveCaps.maxAccountExposureUsd)}`}
                value={liveCaps.exposureUsd}
                max={liveCaps.maxAccountExposureUsd}
                tone={
                  liveCaps.exposureUsd >= liveCaps.maxAccountExposureUsd
                    ? "loss"
                    : liveCaps.exposureUsd >= 0.8 * liveCaps.maxAccountExposureUsd
                      ? "warning"
                      : "accent"
                }
              />
            ) : (
              <CapRow
                label="Account exposure ceiling"
                value={formatCurrency(liveCaps.maxAccountExposureUsd)}
              />
            )}
            {liveCaps.drawdownPct !== null ? (
              <ProgressBar
                label="Drawdown vs kill switch"
                valueText={`${formatPercent(-liveCaps.drawdownPct)} / −${(liveCaps.drawdownKillPct * 100).toFixed(0)}%`}
                value={liveCaps.drawdownPct}
                max={liveCaps.drawdownKillPct}
                tone={
                  liveCaps.killBreached
                    ? "loss"
                    : liveCaps.drawdownPct >= 0.8 * liveCaps.drawdownKillPct
                      ? "warning"
                      : "accent"
                }
              />
            ) : (
              <CapRow
                label="Drawdown kill switch"
                value={`−${(liveCaps.drawdownKillPct * 100).toFixed(0)}% from high-water`}
              />
            )}
            <CapRow
              label="Weekly funding cap"
              value={formatCurrency(liveCaps.weeklyFundingCapUsd)}
            />
          </div>

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
              {live.snapshot.positions.length >= 2 ? (
                <div className="mt-4 border-t border-line pt-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-fg-muted">
                    Holdings mix
                  </h4>
                  <CompositionRing
                    title="Live holdings by market value"
                    centerValue={String(live.snapshot.positions.length)}
                    centerLabel="holdings"
                    slices={live.snapshot.positions
                      .filter((p) => p.marketValue > 0)
                      .slice()
                      .sort((a, b) => b.marketValue - a.marketValue)
                      .slice(0, 6)
                      .map((p) => ({
                        label: p.symbol,
                        value: p.marketValue,
                        valueText: formatCurrency(p.marketValue),
                      }))}
                  />
                </div>
              ) : live.snapshot.positions.length === 1 ? (
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
