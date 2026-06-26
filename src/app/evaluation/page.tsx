import { HeroCard, HeroMetric, HeroStat } from "@/components/hero-card";
import { Card, PageTitle, StatCard } from "@/components/page-shell";
import { ProgressBar } from "@/components/ui/progress";
import { formatCurrency, formatPercent, toneForValue } from "@/lib/format";
import { getEvaluationScorecard, getLiveBookPerformance } from "@/lib/server/eval";
import { getGovernanceScorecard } from "@/lib/server/governance";
import { getViewMode } from "@/lib/server/mode";
import { verdictStyle } from "@/lib/eval/verdict-style";
import type { Scorecard } from "@/lib/eval/scorecard";
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

function VerdictBanner({ verdict }: { verdict: Scorecard["verdict"] }) {
  const style = verdictStyle[verdict.kind];
  return (
    <div className={`rounded-card border p-5 ${style.className}`}>
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium uppercase tracking-wide opacity-80">
          Advisory verdict
        </span>
        <span className="text-lg font-semibold">{style.label}</span>
      </div>
      <ul className="mt-3 flex list-disc flex-col gap-1 pl-5 text-sm text-fg">
        {verdict.reasons.map((r, i) => (
          <li key={i} className="text-pretty">
            {r}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-fg-muted">
        Advisory only — the final GO to a capped live pilot is a human decision,
        and the qualitative criteria (section 5) are not auto-scored.
      </p>
    </div>
  );
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
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-fg">
          {title}
        </h2>
        {note ? <p className="text-xs text-fg-muted">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

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

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
        ok
          ? "border-gain/40 bg-gain/10 text-gain"
          : "border-loss/40 bg-loss/10 text-loss"
      }`}
    >
      <span aria-hidden>{ok ? "✓" : "✕"}</span>
      {children}
    </span>
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
        <p className="text-sm text-fg-muted">
          No governance decisions observed yet — once proposals are red-teamed
          and orders pass (or are blocked by) the rails, this scorecard shows the
          gate&apos;s selectivity and per-rule rejection counts.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      {lowSample ? (
        <div className="rounded-card border border-warning-border bg-warning-surface px-3 py-2 text-xs text-warning">
          Small sample ({sampleSize} governance decision
          {sampleSize === 1 ? "" : "s"}) — read as a signal, not a verdict.
        </div>
      ) : null}

      <div>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Red-team selectivity ({judged} judged · {tradesPlaced} placed)
        </h3>
        <Row
          label="Approve rate"
          value={`${pct(redTeam.approveRate, { signed: false })} (${redTeam.approve})`}
          tone="gain"
        />
        <Row
          label="Concern (downsize)"
          value={String(redTeam.concern)}
        />
        <Row
          label="Reject rate"
          value={`${pct(redTeam.rejectRate, { signed: false })} (${redTeam.reject})`}
          tone="loss"
        />
      </div>

      <div>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-fg-muted">
          Rejections by gate ({rejections.total})
        </h3>
        <Row label="Red-team" value={String(rejections.byActor.redTeam)} />
        <Row label="Risk rails" value={String(rejections.byActor.rules)} />
        <Row label="Human" value={String(rejections.byActor.human)} />
      </div>

      {rejections.byRule.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-fg-muted">
            Per-rule rejections
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {rejections.byRule.map((r) => (
              <li
                key={r.rule}
                className="rounded-pill border border-line bg-surface-overlay px-2.5 py-0.5 text-xs font-medium text-fg"
              >
                {r.rule} · {r.count}
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
        <p className="text-sm text-fg-muted">
          No live snapshot yet — connect the Robinhood Agentic account and
          Refresh (or wait for the scheduled live refresh) to populate live-book
          performance.
        </p>
      </Card>
    );
  }
  const plTone =
    perf.unrealizedPlUsd > 0 ? "gain" : perf.unrealizedPlUsd < 0 ? "loss" : "neutral";
  return (
    <Card className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open positions" value={String(perf.positions)} />
        <StatCard label="Cost basis" value={formatCurrency(perf.costBasisUsd)} />
        <StatCard label="Market value" value={formatCurrency(perf.marketValueUsd)} />
        <StatCard
          label="Exits taken"
          value={String(perf.exitsTaken)}
        />
      </div>
      <div>
        <Row
          label="Unrealized P&L (vs cost basis)"
          value={`${perf.unrealizedPlUsd >= 0 ? "+" : ""}${formatCurrency(
            perf.unrealizedPlUsd,
          )}${perf.unrealizedPlPct === null ? "" : ` · ${pct(perf.unrealizedPlPct)}`}`}
          tone={plTone}
        />
        {perf.benchmark ? (
          <>
            <Row
              label="Live return"
              value={pct(perf.benchmark.portfolioReturnPct)}
              tone={toneForValue(perf.benchmark.portfolioReturnPct)}
            />
            <Row
              label={`${perf.benchmark.symbol} return`}
              value={pct(perf.benchmark.benchmarkReturnPct)}
              tone={toneForValue(perf.benchmark.benchmarkReturnPct)}
            />
            <Row
              label={`Excess vs ${perf.benchmark.symbol} (alpha)`}
              value={pct(perf.benchmark.excessReturnPct)}
              tone={toneForValue(perf.benchmark.excessReturnPct)}
            />
          </>
        ) : (
          <Row label="Vs SPY" value={`${DASH} (benchmark not on snapshot)`} />
        )}
      </div>
    </Card>
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
              <div className="grid grid-cols-2 gap-3">
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
            proving-ground for the engine. Your <span className="font-medium text-fg">live</span>{" "}
            trades are human-approved per trade (not auto-scored there). That gate
            only governs whether <span className="font-medium text-fg">hands-off
            automation</span> (no human in the loop) may ever be enabled — it does
            not gate your own approvals. Switch to the{" "}
            <span className="font-medium text-fg">Paper</span> view for the full
            rubric.
          </p>
        </Card>
      </div>
    );
  }

  const [card, governance] = await Promise.all([
    getEvaluationScorecard(),
    getGovernanceScorecard(),
  ]);
  const { window, returns, benchmark, trades, integrity, reliability } = card;

  return (
    <div className="flex flex-col gap-8">
      <PageTitle
        title="Evaluation"
        subtitle="Phase 2 paper-desk scorecard — the go/no-go gate to the Phase 3 live pilot. Computed live from data/ (snapshots, journal, proposals, run logs)."
      />

      <VerdictBanner verdict={card.verdict} />

      <Section
        title="Window"
        note="Sample window derived from the latest paper snapshot's equity curve."
      >
        <Card className="flex flex-col gap-5">
          <ProgressBar
            label="Evaluation window"
            valueText={`${window.points} / 30 sessions`}
            value={window.points}
            max={30}
            tone={window.points >= 30 ? "gain" : "accent"}
            caption={
              window.points >= 30
                ? "Full evaluation window reached."
                : `${Math.max(0, 30 - window.points)} more equity points to a full 30-session window.`
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Start" value={window.startDate ?? DASH} />
            <StatCard label="End" value={window.endDate ?? DASH} />
            <StatCard label="Equity points" value={String(window.points)} />
            <StatCard
              label="Equity"
              value={
                window.startingEquity === null || window.endingEquity === null
                  ? DASH
                  : `${window.startingEquity.toLocaleString()} → ${window.endingEquity.toLocaleString()}`
              }
            />
          </div>
        </Card>
      </Section>

      <Section
        title="1 · Performance vs benchmark"
        note={`Desk equity curve vs ${benchmark.symbol}. ${benchmark.symbol} drawdown/volatility come from its daily closes (Alpaca data API); a — means the series was unavailable.`}
      >
        <Card>
          <Row
            label="Total return — desk"
            value={pct(benchmark.deskReturnPct)}
            tone={
              benchmark.deskReturnPct === null
                ? "neutral"
                : toneForValue(benchmark.deskReturnPct)
            }
          />
          <Row
            label={`Total return — ${benchmark.symbol}`}
            value={pct(benchmark.benchmarkReturnPct)}
            tone={
              benchmark.benchmarkReturnPct === null
                ? "neutral"
                : toneForValue(benchmark.benchmarkReturnPct)
            }
          />
          <Row
            label="Excess return (alpha)"
            value={pct(benchmark.excessReturnPct)}
            tone={
              benchmark.excessReturnPct === null
                ? "neutral"
                : toneForValue(benchmark.excessReturnPct)
            }
          />
          <Row
            label="Max drawdown — desk"
            value={pct(benchmark.deskMaxDrawdownPct, { signed: false })}
            tone={benchmark.deskMaxDrawdownPct ? "loss" : "neutral"}
          />
          <Row
            label={`Max drawdown — ${benchmark.symbol}`}
            value={pct(benchmark.benchmarkMaxDrawdownPct, { signed: false })}
            tone={benchmark.benchmarkMaxDrawdownPct ? "loss" : "neutral"}
          />
          <Row
            label="Drawdown vs benchmark"
            value={
              benchmark.drawdownExcessPct === null
                ? DASH
                : `${benchmark.drawdownExcessPct > 0 ? "+" : ""}${(
                    benchmark.drawdownExcessPct * 100
                  ).toFixed(2)}pp`
            }
            tone={
              benchmark.drawdownExcessPct === null
                ? "neutral"
                : benchmark.drawdownExcessPct > 0
                  ? "loss"
                  : "gain"
            }
          />
          <Row
            label="Return ÷ max-drawdown"
            value={num(returns.returnOverMaxDd)}
          />
          <Row
            label="Volatility — desk (per-period stdev)"
            value={pct(returns.volatility, { signed: false })}
          />
          <Row
            label={`Volatility — ${benchmark.symbol}`}
            value={pct(benchmark.benchmarkVolatility, { signed: false })}
          />
          <Row label="Simple Sharpe (rf=0)" value={num(returns.sharpe)} />
        </Card>
      </Section>

      <Section title="2 · Trade statistics" note="Closed round-trips, FIFO long-only.">
        {trades.tradesClosed === 0 ? (
          <Card className="border-dashed">
            <p className="text-sm text-fg-muted">
              No closed round-trips yet ({trades.ordersExecuted} order
              {trades.ordersExecuted === 1 ? "" : "s"} executed,{" "}
              {trades.proposalsGenerated} proposal
              {trades.proposalsGenerated === 1 ? "" : "s"} generated). Trade
              statistics populate once positions are closed.
            </p>
          </Card>
        ) : (
          <Card>
            <Row label="Trades closed" value={String(trades.tradesClosed)} />
            <Row label="Win rate" value={pct(trades.winRate, { signed: false })} />
            <Row label="Avg win" value={pct(trades.avgWinPct)} tone="gain" />
            <Row label="Avg loss" value={pct(trades.avgLossPct)} tone="loss" />
            <Row label="Profit factor" value={num(trades.profitFactor)} />
            <Row
              label="Avg holding period"
              value={
                trades.avgHoldingDays === null
                  ? DASH
                  : `${num(trades.avgHoldingDays, 1)} days`
              }
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
        )}
      </Section>

      <Section
        title="3 · Process integrity"
        note="Must pass regardless of P&L. Rule-bypass detection is a manual check."
      >
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge ok={integrity.ordersWithoutStop === 0}>
              {integrity.ordersWithoutStop === 0
                ? "Every buy carries a stop"
                : `${integrity.ordersWithoutStop} buy(s) without a stop`}
            </Badge>
            <Badge ok={!integrity.realMoneyPathTouched}>
              {integrity.realMoneyPathTouched
                ? "Live snapshot present"
                : "No real-money path touched"}
            </Badge>
          </div>
          <div>
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

      <Section title="4 · Reliability" note="Scheduled-routine run outcomes (data/logs/).">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Total runs" value={String(reliability.totalRuns)} />
          <StatCard
            label="Completed"
            value={String(reliability.completed)}
            tone="gain"
          />
          <StatCard
            label="Errored"
            value={String(reliability.errored)}
            tone={reliability.errored ? "loss" : "neutral"}
          />
          <StatCard label="Skipped" value={String(reliability.skipped)} />
          <StatCard label="Locked" value={String(reliability.locked)} />
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
          <p className="text-sm text-fg-muted">
            Recurring-mistake review, lessons promoted to the playbook, journal
            honesty, and whether the red-team meaningfully changed outcomes are
            qualitative — assess them from the Decision Journal and Coaching log.
            They are not auto-scored and remain part of the human GO decision.
          </p>
        </Card>
      </Section>
    </div>
  );
}
