import { ModuleCard } from "@/components/overview/module-card";
import { formatPercent } from "@/lib/format";
import type { VerdictKind } from "@/lib/eval/scorecard";
import type { EvalSnapshot } from "@/lib/server/overview";

const verdictStyle: Record<VerdictKind, { label: string; className: string }> = {
  "go-candidate": {
    label: "GO candidate",
    className: "border-gain/40 bg-gain/10 text-gain",
  },
  iterate: {
    label: "Iterate",
    className: "border-accent/40 bg-accent/10 text-accent",
  },
  "no-go": { label: "No-go", className: "border-loss/40 bg-loss/10 text-loss" },
  incomplete: {
    label: "Incomplete",
    className: "border-line bg-surface-overlay text-fg-muted",
  },
};

/**
 * Evaluation gate snapshot — the Phase 2 go/no-go gate in miniature: window
 * size, current excess return vs SPY, process-integrity status, and the
 * advisory verdict pill. Reads the same `getEvaluationScorecard` the
 * Evaluation page uses; links there for the full rubric.
 */
export function EvalSnapshotModule({ evaluation }: { evaluation: EvalSnapshot }) {
  const v = verdictStyle[evaluation.verdict];
  const excess = evaluation.excessReturnPct;
  const excessTone =
    excess === null ? "text-fg-muted" : excess >= 0 ? "text-gain" : "text-loss";

  const windowLabel =
    evaluation.windowDays !== null
      ? `${evaluation.windowDays} day${evaluation.windowDays === 1 ? "" : "s"} · ${evaluation.points} snapshots`
      : `${evaluation.points} snapshot${evaluation.points === 1 ? "" : "s"}`;

  return (
    <ModuleCard
      title="Evaluation gate"
      subtitle="Phase 2 go/no-go — advisory"
      href="/evaluation"
      hrefLabel="Full scorecard"
    >
      <div className={`mb-3 rounded-card border px-3 py-2 ${v.className}`}>
        <span className="text-xs font-medium uppercase tracking-wide opacity-80">
          Advisory verdict
        </span>
        <p className="text-base font-semibold">{v.label}</p>
      </div>

      <dl className="grid grid-cols-1 gap-y-2 text-sm">
        <Row label="Window">
          <span className="tabular-nums text-fg">{windowLabel}</span>
        </Row>
        <Row label={`Excess vs ${evaluation.benchmarkSymbol}`}>
          <span className={`font-medium tabular-nums ${excessTone}`}>
            {excess === null ? "—" : formatPercent(excess)}
          </span>
        </Row>
        <Row label="Process integrity">
          <span
            className={`inline-flex items-center gap-1.5 text-xs font-medium ${
              evaluation.integrityPasses ? "text-gain" : "text-loss"
            }`}
          >
            <span aria-hidden>{evaluation.integrityPasses ? "✓" : "✕"}</span>
            {evaluation.integrityPasses ? "Passing" : "Failing"}
          </span>
        </Row>
      </dl>

      {excess === null ? (
        <p className="mt-3 text-pretty text-xs text-fg-muted">
          Not enough history to judge excess return yet — the verdict firms up as
          the paper window grows.
        </p>
      ) : null}
    </ModuleCard>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
