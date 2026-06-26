"use client";

import { Term } from "@/components/term";
import { CheckIcon, FlagIcon } from "@/components/icons";
import {
  assessCashFlowQuality,
  cashFlowTrendLabel,
  hasCashFlowData,
} from "@/lib/cash-flow";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import type { CashFlowQuality } from "@/lib/types";
import type { ReactNode } from "react";

/**
 * The value lens's **cash-flow quality** stat block (value-cashflow M1) — the
 * floor-vs-trap evidence a value / mean-reversion call lives or dies on. Renders
 * the FCF level + trend, FCF yield, operating cash flow, and leverage/coverage
 * with glossary tooltips, plus the pure pass/flag assessment.
 *
 * Honest framing: durable cash flow doesn't make a value play a buy, but its
 * absence/deterioration is a strong disqualifier — so this is shown as evidence
 * for the human + the value red-team to weigh, never a verdict. Renders nothing
 * when there's no usable data (the caller decides whether to show the block).
 */
export function CashFlowBlock({ cashFlow }: { cashFlow: CashFlowQuality | null }) {
  if (!hasCashFlowData(cashFlow) || !cashFlow) return null;
  const { status, reasons } = assessCashFlowQuality(cashFlow);

  return (
    <div className="flex flex-col gap-3">
      <AssessmentBanner status={status} reasons={reasons} />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Stat
          label={<Term term="fcf">Free cash flow</Term>}
          value={money(cashFlow.freeCashFlow)}
          tone={fcfTone(cashFlow.freeCashFlow)}
        />
        <Stat
          label={<Term term="fcf-yield">FCF yield</Term>}
          value={percent(cashFlow.fcfYield)}
        />
        <Stat label="FCF trend" value={cashFlowTrendLabel(cashFlow.fcfTrend)} />
        <Stat
          label="Operating cash flow"
          value={money(cashFlow.operatingCashFlow)}
        />
        <Stat label="Net debt" value={money(cashFlow.netDebt)} />
        <Stat label="Debt / equity" value={ratio(cashFlow.debtToEquity)} />
        <Stat
          label={<Term term="interest-coverage">Interest coverage</Term>}
          value={
            cashFlow.interestCoverage === null
              ? "—"
              : `${cashFlow.interestCoverage.toFixed(1)}×`
          }
        />
      </dl>

      <p className="text-xs leading-relaxed text-fg-muted">
        Evidence for the value floor-vs-trap call — not a verdict. Strong, durable
        free cash flow supports the floor; negative or declining FCF and rising
        leverage are a value-trap warning.
      </p>
    </div>
  );
}

/** A pass/flag/na banner summarizing the cash-flow read. */
function AssessmentBanner({
  status,
  reasons,
}: {
  status: "pass" | "flag" | "na";
  reasons: string[];
}) {
  if (status === "pass") {
    return (
      <div className="flex items-center gap-2 rounded-input border border-success/30 bg-success-surface px-3 py-2 text-sm text-success">
        <CheckIcon className="size-4 shrink-0" aria-hidden />
        <span>Durable cash flow supports the floor thesis.</span>
      </div>
    );
  }
  if (status === "flag") {
    return (
      <div className="flex items-start gap-2 rounded-input border border-warning/30 bg-warning-surface px-3 py-2 text-sm text-warning">
        <FlagIcon className="size-3.5 shrink-0 translate-y-0.5" aria-hidden />
        <span>
          Value-trap warning{reasons.length ? `: ${reasons.join(", ")}` : ""}.
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-input border border-line bg-surface px-3 py-2 text-sm text-fg-muted">
      Cash-flow read is inconclusive — weigh it alongside the rest of the thesis.
    </div>
  );
}

/** One labelled figure in the cash-flow grid. */
function Stat({
  label,
  value,
  tone,
}: {
  label: ReactNode;
  value: string;
  tone?: "loss";
}) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd
        className={`text-right font-medium tabular-nums ${
          tone === "loss" ? "text-loss" : "text-fg"
        }`}
      >
        {value}
      </dd>
    </>
  );
}

function money(value: number | null): string {
  return value === null ? "—" : formatCompactCurrency(value);
}
function percent(value: number | null): string {
  return value === null ? "—" : formatPercent(value, { signed: false });
}
function ratio(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}
/** Negative FCF reads as a loss tone — the one figure where the sign is the tell. */
function fcfTone(value: number | null): "loss" | undefined {
  return value !== null && value <= 0 ? "loss" : undefined;
}
