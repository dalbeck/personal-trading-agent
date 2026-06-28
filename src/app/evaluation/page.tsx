import { HeroCard, HeroMetric, HeroStat } from "@/components/hero-card";
import { Card, PageTitle, SectionTitle } from "@/components/page-shell";
import { KpiCard } from "@/components/overview/kpi-card";
import { DivergingBars } from "@/components/charts/diverging-bars";
import { Badge } from "@/components/ui/badge";
import {
  IntegrityChip,
  ReliabilityTile,
  VerdictHero,
} from "@/components/evaluation/scorecard-cards";
import {
  CheckIcon,
  GoLiveIcon,
  InfoIcon,
  PositionsIcon,
  RoutinesIcon,
  ScaleIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
  ZapIcon,
} from "@/components/icons";
import { formatCurrency, formatPercent, toneForValue } from "@/lib/format";
import {
  getEvaluationScorecard,
  getLiveBookPerformance,
  getNetPerformance,
} from "@/lib/server/eval";
import { getGovernanceScorecard } from "@/lib/server/governance";
import { getViewMode } from "@/lib/server/mode";
import type { GovernanceScorecard } from "@/lib/eval/governance";
import type { LiveBookPerformance } from "@/lib/eval/live-performance";

export const dynamic = "force-dynamic";

const DASH = "—";

function pct(value: number | null, opts?: { signed?: boolean }): string {
  return value === null ? DASH : formatPercent(value, opts);
}

function num(value: number | null, digits = 2): string {
  return value === null ? DASH : value.toFixed(digits);
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <SectionTitle title={title} note={note} />
      {children}
    </section>
  );
}

/** Compact label/value pair for the rubric long-tail (kept sans tabular-nums). */
function Row({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "gain" | "loss" | "neutral";
}) {
  const toneClass =
    tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-fg";
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-0">
      <span className="text-sm text-fg-muted">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

function GovernanceScorecardCard({
  governance,
}: {
  governance: GovernanceScorecard;
}) {
  const { judged, redTeam, rejections, tradesPlaced, sampleSize, lowSample } =
    governance;

  if (sampleSize === 0) {
    return (
      <Card className="border-dashed">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent/10 text-accent"
          >
            <InfoIcon className="size-[18px]" />
          </span>
          <p className="text-pretty text-sm text-fg-muted">
            No governance decisions observed yet — once proposals are red-teamed
            and orders pass (or are blocked by) the rails, this scorecard shows
            the gate&apos;s selectivity and per-rule rejection counts.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-5">
      {lowSample ? (
        <div className="rounded-card border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning">
          Small sample ({sampleSize} governance decision
          {sampleSize === 1 ? "" : "s"}) — read as a signal, not a verdict.
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
            <ScaleIcon className="size-3.5" aria-hidden />
            Red-team selectivity ({judged} judged · {tradesPlaced} placed)
          </h3>
          <Row
            label="Approve rate"
            value={`${pct(redTeam.approveRate, { signed: false })} (${redTeam.approve})`}
            tone="gain"
          />
          <Row label="Concern (downsize)" value={String(redTeam.concern)} />
          <Row
            label="Reject rate"
            value={`${pct(redTeam.rejectRate, { signed: false })} (${redTeam.reject})`}
            tone="loss"
          />
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
            <ZapIcon className="size-3.5" aria-hidden />
            Rejections by gate ({rejections.total})
          </h3>
          <Row label="Red-team" value={String(rejections.byActor.redTeam)} />
          <Row label="Risk rails" value={String(rejections.byActor.rules)} />
          <Row label="Human" value={String(rejections.byActor.human)} />
        </div>
      </div>

      {rejections.byRule.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
            Per-rule rejections
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {rejections.byRule.map((r) => (
              <li key={r.rule}>
                <Badge tone="muted" solid>
                  {r.rule} · {r.count}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function LiveBookCard({ perf }: { perf: LiveBookPerformance | null }) {
  if (!perf) {
    return (
      <Card className="border-dashed">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent/10 text-accent"
          >
            <InfoIcon className="size-[18px]" />
          </span>
          <p className="text-pretty text-sm text-fg-muted">
            No live snapshot yet — connect the Robinhood Agentic account and
            Refresh (or wait for the scheduled live refresh) to populate
            live-book performance.
          </p>
        </div>
      </Card>
    );
  }
  const plTone = toneForValue(perf.unrealizedPlUsd);
  const b = perf.benchmark;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Market value"
          value={formatCurrency(perf.marketValueUsd)}
          icon={WalletIcon}
        />
        <KpiCard
          label="Unrealized P&L"
          value={formatCurrency(perf.unrealizedPlUsd, { signed: true })}
          icon={plTone === "loss" ? TrendingDownIcon : TrendingUpIcon}
          tone={plTone}
          delta={
            perf.unrealizedPlPct === null
              ? undefined
              : formatPercent(perf.unrealizedPlPct)
          }
        />
        <KpiCard
          label="Cost basis"
          value={formatCurrency(perf.costBasisUsd)}
          icon={ScaleIcon}
        />
        <KpiCard
          label="Exits taken"
          value={String(perf.exitsTaken)}
          icon={GoLiveIcon}
        />
      </div>

      {b ? (
        <Card className="flex flex-col gap-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            Live vs {b.symbol}
          </h3>
          <DivergingBars
            ariaLabel={`Live book return ${pct(
              b.portfolioReturnPct,
            )}, ${b.symbol} return ${pct(b.benchmarkReturnPct)}, excess ${pct(
              b.excessReturnPct,
            )}.`}
            rows={[
              {
                label: "Live book",
                value: b.portfolioReturnPct,
                valueText: pct(b.portfolioReturnPct),
              },
              {
                label: b.symbol,
                value: b.benchmarkReturnPct,
                valueText: pct(b.benchmarkReturnPct),
              },
              {
                label: "Excess (alpha)",
                value: b.excessReturnPct,
                valueText: pct(b.excessReturnPct),
              },
            ]}
          />
        </Card>
      ) : (
        <Card>
          <Row label="Vs SPY" value={`${DASH} (benchmark not on snapshot)`} />
        </Card>
      )}
    </div>
  );
}

export default async function EvaluationPage() {
  const mode = await getViewMode();

  // LIVE view (M3): the live book is first-class here too — its own performance
  // (vs cost basis, vs SPY where observable) and its own governance, clearly
  // labelled and never mixed with the paper proving-ground scorecard below.
  if (mode === "live") {
    const [livePerf, liveGovernance] = await Promise.all([
      getLiveBookPerformance(),
      getGovernanceScorecard({ account: "live" }),
    ]);
    return (
      <div className="flex flex-col gap-8">
        <PageTitle
          title="Evaluation"
          subtitle="The live book's own performance and governance. The paper go/no-go scorecard is secondary — switch to the Paper view for the full rubric."
        />

        {livePerf ? (
          <HeroCard>
            <div className="mb-6 flex items-center gap-2">
              <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
                Live book
              </h2>
              <span className="ml-auto text-xs text-fg-muted">
                {livePerf.positions} open · read-only
              </span>
            </div>
            <div className="grid gap-6 lg:grid-cols-[1.05fr_1.5fr] lg:items-center">
              <HeroMetric
                label="Market value"
                value={formatCurrency(livePerf.marketValueUsd)}
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <HeroStat
                  label="Unrealized P&L"
                  value={formatCurrency(livePerf.unrealizedPlUsd, {
                    signed: true,
                  })}
                  tone={toneForValue(livePerf.unrealizedPlUsd)}
                  delta={
                    livePerf.unrealizedPlPct === null
                      ? undefined
                      : formatPercent(livePerf.unrealizedPlPct)
                  }
                />
                <HeroStat
                  label="Cost basis"
                  value={formatCurrency(livePerf.costBasisUsd)}
                />
                {livePerf.benchmark ? (
                  <HeroStat
                    label={`Excess vs ${livePerf.benchmark.symbol}`}
                    value={formatPercent(livePerf.benchmark.excessReturnPct)}
                    tone={toneForValue(livePerf.benchmark.excessReturnPct)}
                  />
                ) : (
                  <HeroStat
                    label="Exits taken"
                    value={String(livePerf.exitsTaken)}
                  />
                )}
              </div>
            </div>
          </HeroCard>
        ) : null}

        <Section
          title="Live book — performance"
          note="Human-approved per trade (not graded by the go/no-go gate). Unrealized P&L vs cost basis, and vs SPY where the live snapshot carries a benchmark."
        >
          <LiveBookCard perf={livePerf} />
        </Section>

        <Section
          title="Live governance"
          note="The red-team + risk rails on LIVE proposals and rejections, scoped to the live book (no paper bleed). Advisory; small samples read as a signal, not a verdict."
        >
          <GovernanceScorecardCard governance={liveGovernance} />
        </Section>

        <Card className="border-dashed">
          <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
            Paper proving-ground (secondary)
          </h2>
          <p className="mt-2 text-pretty text-sm text-fg-muted">
            The go/no-go scorecard grades the{" "}
            <span className="font-medium text-fg">paper desk</span> — a secondary
            proving-ground for the engine. Your{" "}
            <span className="font-medium text-fg">live</span> trades are
            human-approved per trade (not auto-scored there). That gate only
            governs whether{" "}
            <span className="font-medium text-fg">
              hands-off automation
            </span>{" "}
            (no human in the loop) may ever be enabled — it does not gate your
            own approvals. Switch to the{" "}
            <span className="font-medium text-fg">Paper</span> view for the full
            rubric.
          </p>
        </Card>
      </div>
    );
  }

  const [card, governance, net] = await Promise.all([
    getEvaluationScorecard(),
    getGovernanceScorecard(),
    getNetPerformance(),
  ]);
  const { window, returns, trades, integrity, reliability } = card;

  // Diverging bars comparing strategy gross / net-of-cost / SPY cumulative
  // return. Rows are omitted only when a side is unavailable — no value is
  // altered or synthesized.
  const netRows = [
    net.grossReturnPct === null
      ? null
      : {
          label: "Gross",
          value: net.grossReturnPct,
          valueText: pct(net.grossReturnPct),
        },
    net.netReturnPct === null
      ? null
      : {
          label: "Net of cost",
          value: net.netReturnPct,
          valueText: pct(net.netReturnPct),
        },
    net.benchmarkReturnPct === null
      ? null
      : {
          label: net.benchmarkSymbol,
          value: net.benchmarkReturnPct,
          valueText: pct(net.benchmarkReturnPct),
        },
  ].filter((r): r is NonNullable<typeof r> => r !== null);

  // Drawdown gap (magnitudes): positive = strategy drew down more than SPY.
  const ddExcess =
    net.strategyMaxDrawdownPct !== null && net.benchmarkMaxDrawdownPct !== null
      ? Math.abs(net.strategyMaxDrawdownPct) -
        Math.abs(net.benchmarkMaxDrawdownPct)
      : null;

  return (
    <div className="flex flex-col gap-10">
      <PageTitle
        title="Evaluation"
        subtitle="Phase 2 paper-desk scorecard — the go/no-go gate to the Phase 3 live pilot. Computed live from data/ (snapshots, journal, proposals, run logs)."
      />

      {/* FOCAL: the verdict hero — go/no-go verdict + reasons + window progress. */}
      <VerdictHero verdict={card.verdict} window={window} />

      <Section
        title={`1 · Net-of-cost performance vs ${net.benchmarkSymbol}`}
        note={`The headline question: does the strategy beat ${net.benchmarkSymbol} after the real run-cost? Returns are annualized over the ${net.windowDays}-day window; net = gross − the modeled cost drag. ${net.benchmarkSymbol} return/drawdown come from its daily closes (Alpaca data API); a — means the series was unavailable.`}
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              label={`Net excess vs ${net.benchmarkSymbol} (annualized)`}
              value={pct(net.netExcessAnnualizedPct)}
              icon={ScaleIcon}
              tone={
                net.netExcessAnnualizedPct === null
                  ? "neutral"
                  : toneForValue(net.netExcessAnnualizedPct)
              }
            />
            <KpiCard
              label={`${net.benchmarkSymbol} return (annualized)`}
              value={pct(net.benchmarkAnnualizedPct)}
              icon={ScaleIcon}
              tone={
                net.benchmarkAnnualizedPct === null
                  ? "neutral"
                  : toneForValue(net.benchmarkAnnualizedPct)
              }
            />
            <KpiCard
              label="Net of cost (annualized)"
              value={pct(net.netAnnualizedPct)}
              icon={TrendingUpIcon}
              tone={
                net.netAnnualizedPct === null
                  ? "neutral"
                  : toneForValue(net.netAnnualizedPct)
              }
            />
            <KpiCard
              label="Gross (annualized)"
              value={pct(net.grossAnnualizedPct)}
              icon={TrendingUpIcon}
              tone={
                net.grossAnnualizedPct === null
                  ? "neutral"
                  : toneForValue(net.grossAnnualizedPct)
              }
            />
          </div>

          <Card className="flex flex-col gap-5">
            <div>
              <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-fg-muted">
                Gross vs net vs {net.benchmarkSymbol} — cumulative return
              </h3>
              {netRows.length > 0 ? (
                <DivergingBars
                  ariaLabel={`Gross return ${pct(
                    net.grossReturnPct,
                  )}, net-of-cost ${pct(net.netReturnPct)}, ${
                    net.benchmarkSymbol
                  } ${pct(net.benchmarkReturnPct)}.`}
                  rows={netRows}
                />
              ) : (
                <p className="text-sm text-fg-muted">
                  Return series unavailable — cannot chart performance yet.
                </p>
              )}
            </div>

            <div className="border-t border-line pt-1">
              <Row
                label="Net excess (cumulative)"
                value={pct(net.netExcessReturnPct)}
                tone={
                  net.netExcessReturnPct === null
                    ? "neutral"
                    : toneForValue(net.netExcessReturnPct)
                }
              />
              <Row
                label="Cost drag (over window)"
                value={pct(net.costDragPct, { signed: false })}
                tone={net.costDragPct > 0 ? "loss" : "neutral"}
              />
              <Row
                label="Max drawdown — strategy"
                value={pct(net.strategyMaxDrawdownPct, { signed: false })}
                tone={net.strategyMaxDrawdownPct ? "loss" : "neutral"}
              />
              <Row
                label={`Max drawdown — ${net.benchmarkSymbol}`}
                value={pct(net.benchmarkMaxDrawdownPct, { signed: false })}
                tone={net.benchmarkMaxDrawdownPct ? "loss" : "neutral"}
              />
              <Row
                label={`Drawdown vs ${net.benchmarkSymbol}`}
                value={
                  ddExcess === null
                    ? DASH
                    : `${ddExcess > 0 ? "+" : ""}${(ddExcess * 100).toFixed(
                        2,
                      )}pp`
                }
                tone={
                  ddExcess === null ? "neutral" : ddExcess > 0 ? "loss" : "gain"
                }
              />
              <Row
                label="Simple Sharpe / Return ÷ max-DD"
                value={`${num(returns.sharpe)} / ${num(returns.returnOverMaxDd)}`}
              />
              <Row
                label="Volatility — strategy / per-period stdev"
                value={pct(net.strategyVolatility, { signed: false })}
              />
            </div>
          </Card>
        </div>
      </Section>

      <Section
        title="2 · Trade statistics"
        note="Closed round-trips, FIFO long-only."
      >
        {trades.tradesClosed === 0 ? (
          <Card className="border-dashed">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent/10 text-accent"
              >
                <InfoIcon className="size-[18px]" />
              </span>
              <p className="text-pretty text-sm text-fg-muted">
                No closed round-trips yet ({trades.ordersExecuted} order
                {trades.ordersExecuted === 1 ? "" : "s"} executed,{" "}
                {trades.proposalsGenerated} proposal
                {trades.proposalsGenerated === 1 ? "" : "s"} generated). Trade
                statistics populate once positions are closed.
              </p>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label="Win rate"
                value={pct(trades.winRate, { signed: false })}
                icon={CheckIcon}
              />
              <KpiCard
                label="Profit factor"
                value={num(trades.profitFactor)}
                icon={ScaleIcon}
              />
              <KpiCard
                label="Trades closed"
                value={String(trades.tradesClosed)}
                icon={PositionsIcon}
              />
              <KpiCard
                label="Avg hold"
                value={
                  trades.avgHoldingDays === null
                    ? DASH
                    : `${num(trades.avgHoldingDays, 1)} days`
                }
                icon={RoutinesIcon}
              />
            </div>
            <Card>
              <Row
                label="Avg win"
                value={pct(trades.avgWinPct)}
                tone="gain"
              />
              <Row
                label="Avg loss"
                value={pct(trades.avgLossPct)}
                tone="loss"
              />
              <Row
                label="Largest win / loss"
                value={`${pct(trades.largestWinPct)} / ${pct(trades.largestLossPct)}`}
              />
              <Row
                label="Proposals vs executed (selectivity)"
                value={`${trades.proposalsGenerated} / ${trades.ordersExecuted}`}
              />
            </Card>
          </div>
        )}
      </Section>

      <Section
        title="3 · Process integrity"
        note="Must pass regardless of P&L. Rule-bypass detection is a manual check."
      >
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <IntegrityChip
              ok={integrity.ordersWithoutStop === 0}
              hardFail
            >
              {integrity.ordersWithoutStop === 0
                ? "Every buy carries a stop"
                : `${integrity.ordersWithoutStop} buy(s) without a stop`}
            </IntegrityChip>
            <IntegrityChip ok={!integrity.realMoneyPathTouched} hardFail>
              {integrity.realMoneyPathTouched
                ? "Live snapshot present"
                : "No real-money path touched"}
            </IntegrityChip>
            <IntegrityChip ok={net.rails.totalBreaches === 0}>
              {net.rails.totalBreaches === 0
                ? "Zero hard-rail breaches"
                : `${net.rails.totalBreaches} hard-rail breach${
                    net.rails.totalBreaches === 1 ? "" : "es"
                  }`}
            </IntegrityChip>
          </div>
          <div>
            <Row
              label="Rail adherence — risk / size / count / orders-per-day breaches"
              value={`${net.rails.perPositionRisk} / ${net.rails.positionSize} / ${net.rails.concurrentPositions} / ${net.rails.ordersPerDay}`}
              tone={net.rails.totalBreaches === 0 ? "gain" : "loss"}
            />
            <Row
              label="Orders blocked by risk rails"
              value={String(integrity.ordersBlockedByRules)}
            />
            <Row
              label="Orders blocked by red-team"
              value={String(integrity.ordersBlockedByRedTeam)}
            />
            <Row
              label="Orders blocked by human"
              value={String(integrity.ordersBlockedByHuman)}
            />
          </div>
        </Card>
      </Section>

      <Section
        title="4 · Reliability"
        note="Scheduled-routine run outcomes (data/logs/)."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <ReliabilityTile
            label="Total runs"
            value={String(reliability.totalRuns)}
          />
          <ReliabilityTile
            label="Completed"
            value={String(reliability.completed)}
            tone="gain"
          />
          <ReliabilityTile
            label="Errored"
            value={String(reliability.errored)}
            tone={reliability.errored ? "loss" : "neutral"}
          />
          <ReliabilityTile
            label="Skipped"
            value={String(reliability.skipped)}
          />
          <ReliabilityTile label="Locked" value={String(reliability.locked)} />
        </div>
      </Section>

      <Section
        title="5 · Governance scorecard"
        note="Is the red-team + the risk rails doing real work? Advisory only, and caveated on small samples — rejected ideas are never placed, so their counterfactual P&L is unobservable."
      >
        <GovernanceScorecardCard governance={governance} />
      </Section>

      <Section title="6 · Behavioral / qualitative">
        <Card className="border-dashed">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-accent/10 text-accent"
            >
              <InfoIcon className="size-[18px]" />
            </span>
            <p className="text-pretty text-sm text-fg-muted">
              Recurring-mistake review, lessons promoted to the playbook,
              journal honesty, and whether the red-team meaningfully changed
              outcomes are qualitative — assess them from the Decision Journal
              and Coaching log. They are not auto-scored and remain part of the
              human GO decision.
            </p>
          </div>
        </Card>
      </Section>
    </div>
  );
}
