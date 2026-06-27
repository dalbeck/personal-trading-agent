"use client";

import { Term } from "@/components/term";
import { CheckIcon, FlagIcon } from "@/components/icons";
import {
  assessDividendFloor,
  dividendCoverage,
  hasDividendData,
} from "@/lib/dividend";
import { formatPercent } from "@/lib/format";
import type { DividendSignals } from "@/lib/types";
import type { ReactNode } from "react";

/**
 * The value lens's **dividend-sustainability** stat block (dividend-floor M1) —
 * yield, payout ratio, FCF coverage, and the growth streak, with glossary
 * tooltips. A durable, well-covered dividend is a recognized value **floor**
 * (downside protection / paid to wait); an uncovered or stretched one is a
 * value-trap flag.
 *
 * Honest framing: a safe dividend satisfies the floor requirement but is NOT a
 * buy signal — a covered dividend can coexist with a multi-year price decline.
 * Evidence for the human + value red-team to weigh. Renders nothing when there's
 * no usable dividend data (the caller decides whether to show the block).
 */
export function DividendBlock({ dividend }: { dividend: DividendSignals | null }) {
  if (!hasDividendData(dividend) || !dividend) return null;
  const { status, floorText, reasons } = assessDividendFloor(dividend);
  const coverage = dividendCoverage(dividend);

  return (
    <div className="flex flex-col gap-3">
      <AssessmentBanner status={status} floorText={floorText} reasons={reasons} />

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Stat
          label={<Term term="dividend-yield">Dividend yield</Term>}
          value={percent(dividend.dividendYield)}
        />
        <Stat
          label={<Term term="payout-ratio">Payout ratio</Term>}
          value={percent(dividend.payoutRatio)}
        />
        <Stat
          label={<Term term="dividend-coverage">FCF coverage</Term>}
          value={coverage === null ? "—" : `${coverage.toFixed(1)}×`}
          tone={
            coverage !== null && coverage < 1 ? "loss" : undefined
          }
        />
        <Stat
          label="FCF payout"
          value={percent(dividend.fcfPayout)}
        />
        <Stat
          label="Growth streak"
          value={
            dividend.growthStreakYears === null
              ? "—"
              : `${dividend.growthStreakYears} yr`
          }
        />
        <Stat label="Dividend CAGR" value={percent(dividend.dividendCagr)} />
      </dl>

      <p className="text-xs leading-relaxed text-fg-muted">
        A durable, well-covered dividend is a value floor — downside protection
        that pays you to wait. It satisfies the &ldquo;why now / floor&rdquo;
        requirement, but it isn&apos;t a buy signal on its own: a covered dividend
        can still coexist with a falling price.
      </p>
    </div>
  );
}

/** A floor / at-risk / na banner summarizing the dividend read. */
function AssessmentBanner({
  status,
  floorText,
  reasons,
}: {
  status: "pass" | "flag" | "na";
  floorText: string | null;
  reasons: string[];
}) {
  if (status === "pass") {
    return (
      <div className="flex items-start gap-2 rounded-input border border-success/30 bg-success-surface px-3 py-2 text-sm text-success">
        <CheckIcon className="size-4 shrink-0 translate-y-0.5" aria-hidden />
        <span>{floorText ?? "Dividend is a credible value floor."}</span>
      </div>
    );
  }
  if (status === "flag") {
    return (
      <div className="flex items-start gap-2 rounded-input border border-warning/30 bg-warning-surface px-3 py-2 text-sm text-warning">
        <FlagIcon className="size-3.5 shrink-0 translate-y-0.5" aria-hidden />
        <span>
          At-risk dividend{reasons.length ? `: ${reasons.join(", ")}` : ""} — a
          value-trap flag, not a floor.
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-input border border-line bg-surface px-3 py-2 text-sm text-fg-muted">
      Pays a dividend, but coverage is unconfirmed — not a verified floor.
    </div>
  );
}

/** One labelled figure in the dividend grid. */
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

function percent(value: number | null): string {
  return value === null ? "—" : formatPercent(value, { signed: false });
}
