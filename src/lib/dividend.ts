/**
 * Dividend sustainability as a recognized **value floor** (dividend-floor M1).
 * For a value / mean-reversion call, a durable, well-covered dividend is a real
 * floor — downside protection that pays you to wait — and should satisfy the
 * "Catalyst or floor — why now" requirement so the value red-team stops
 * rejecting purely for "no stated floor."
 *
 * Honest discipline (per the spec): a safe dividend **satisfies the floor
 * requirement** but does NOT auto-approve — a covered dividend can coexist with
 * a multi-year price decline (a value trap that pays you to wait), so the
 * red-team stays a categorical judgment that may still weigh timing. Conversely,
 * an **uncovered / at-risk** dividend (FCF doesn't cover it, payout stretched) is
 * a value-trap red flag, never a floor.
 *
 * Plain module (no `server-only`) so the client checklist/detail view and the
 * server red-team share one definition. Pure + unit-tested (`dividend.test.ts`).
 */
import { formatPercent } from "@/lib/format";
import type { CheckStatus } from "@/lib/checklist";
import type { DividendSignals } from "@/lib/types";

/**
 * The bars a dividend must clear to count as a floor vs. an at-risk trap. Lenient
 * by design — these gate a *named floor* vs. a *trap flag*, not a hard rail.
 */
export const DIVIDEND_THRESHOLDS = {
  /** FCF coverage (FCF ÷ dividends) at/above this is a comfortably-funded floor. */
  fcfCoverageHealthy: 1.2,
  /** Coverage below this means FCF does NOT cover the dividend — at risk. */
  fcfCoverageAtRisk: 1,
  /** Payout ratio (dividends ÷ earnings) above this is stretched — at risk. */
  payoutRatioStretched: 1,
} as const;

export interface DividendFloorAssessment {
  status: CheckStatus;
  /** True when a durable, well-covered dividend registers a real floor. */
  covered: boolean;
  /** True when the dividend looks uncovered / cut-risk — a value-trap flag. */
  atRisk: boolean;
  /** The concrete floor string for the catalyst / red-team, or null when none.
   *  e.g. "Dividend floor: FCF covers 2.4×, 14-yr growth streak". */
  floorText: string | null;
  /** A short note for the checklist row. */
  detail: string;
  /** The at-risk signals found (empty for a pass / na). */
  reasons: string[];
}

/** True when the block carries at least one usable figure. */
export function hasDividendData(d: DividendSignals | null): boolean {
  if (!d) return false;
  return (
    d.dividendYield !== null ||
    d.payoutRatio !== null ||
    d.fcfPayout !== null ||
    d.fcfCoverage !== null ||
    d.growthStreakYears !== null ||
    d.dividendCagr !== null
  );
}

/** FCF coverage (FCF ÷ dividends): the stored value, or derived from FCF payout. */
export function dividendCoverage(d: DividendSignals): number | null {
  if (d.fcfCoverage !== null) return d.fcfCoverage;
  if (d.fcfPayout !== null && d.fcfPayout > 0) return 1 / d.fcfPayout;
  return null;
}

/** True when the company actually pays a dividend (a non-zero yield or payout). */
function paysDividend(d: DividendSignals): boolean {
  if (d.dividendYield !== null) return d.dividendYield > 0;
  if (d.payoutRatio !== null) return d.payoutRatio > 0;
  return d.fcfPayout !== null || d.fcfCoverage !== null;
}

/**
 * Assess whether the dividend is a real value floor:
 * - **pass** (a named floor) when FCF comfortably covers the dividend
 *   (coverage ≥ healthy) and the payout isn't stretched;
 * - **flag** (a value-trap red flag) when FCF doesn't cover it or the payout
 *   ratio is stretched (>100% of earnings);
 * - **na** otherwise (no dividend, or coverage unknown / merely adequate) —
 *   never a false floor.
 */
export function assessDividendFloor(
  d: DividendSignals | null,
): DividendFloorAssessment {
  if (!hasDividendData(d) || !d || !paysDividend(d)) {
    return { status: "na", covered: false, atRisk: false, floorText: null, detail: "—", reasons: [] };
  }

  const coverage = dividendCoverage(d);
  const reasons: string[] = [];
  // A dividend that actually SHRANK over the measured window (negative CAGR) was
  // cut — a value-trap tell that overrides an otherwise-clean cover (value-quality
  // bar). A flat dividend (streak 0, CAGR ≥ 0 / unknown) is NOT treated as a cut.
  if (d.dividendCagr !== null && d.dividendCagr < 0) {
    reasons.push(
      `dividend cut (${formatPercent(d.dividendCagr, { signed: true })} CAGR)`,
    );
  }
  if (coverage !== null && coverage < DIVIDEND_THRESHOLDS.fcfCoverageAtRisk) {
    reasons.push(`FCF covers only ${coverage.toFixed(1)}× — doesn't cover the dividend`);
  }
  if (
    d.payoutRatio !== null &&
    d.payoutRatio > DIVIDEND_THRESHOLDS.payoutRatioStretched
  ) {
    reasons.push(
      `payout ratio stretched (${formatPercent(d.payoutRatio, { signed: false })})`,
    );
  }
  if (reasons.length > 0) {
    return { status: "flag", covered: false, atRisk: true, floorText: null, detail: reasons[0], reasons };
  }

  const wellCovered =
    coverage !== null && coverage >= DIVIDEND_THRESHOLDS.fcfCoverageHealthy;
  if (wellCovered) {
    const floorText = buildFloorText(d, coverage);
    return {
      status: "pass",
      covered: true,
      atRisk: false,
      floorText,
      detail: floorDetail(d, coverage),
      reasons: [],
    };
  }

  // Pays a dividend but coverage is unknown or only adequate — not a clear floor,
  // not at-risk. Stay neutral.
  return { status: "na", covered: false, atRisk: false, floorText: null, detail: "coverage unconfirmed", reasons: [] };
}

/** The concrete floor string registered as the catalyst + fed to the red-team. */
function buildFloorText(d: DividendSignals, coverage: number): string {
  let text = `Dividend floor: FCF covers ${coverage.toFixed(1)}×`;
  if (d.growthStreakYears !== null && d.growthStreakYears > 0) {
    text += `, ${d.growthStreakYears}-yr growth streak`;
  } else if (d.dividendCagr !== null) {
    text += `, ${formatPercent(d.dividendCagr, { signed: false })} CAGR`;
  }
  return text;
}

/** A compact checklist note, e.g. "FCF covers 2.4× · 3.1% yield". */
function floorDetail(d: DividendSignals, coverage: number): string {
  const parts = [`FCF covers ${coverage.toFixed(1)}×`];
  if (d.dividendYield !== null) {
    parts.push(`${formatPercent(d.dividendYield, { signed: false })} yield`);
  }
  return parts.join(" · ");
}
