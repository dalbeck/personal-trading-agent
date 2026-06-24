import { Card, PageTitle, StatCard } from "@/components/page-shell";
import { formatPercent, toneForValue } from "@/lib/format";
import { getEvaluationScorecard } from "@/lib/server/eval";
import { verdictStyle } from "@/lib/eval/verdict-style";
import type { Scorecard } from "@/lib/eval/scorecard";

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

export default async function EvaluationPage() {
  const card = await getEvaluationScorecard();
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

      <Section title="5 · Behavioral / qualitative">
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
