/**
 * Cash-flow quality — the value lens's floor-vs-trap discriminator
 * (value-cashflow M1). For a value / mean-reversion call, cash flow is the key
 * tell between "hitting a floor with upside" and a value trap: durable, positive
 * **free cash flow** with a healthy yield and manageable leverage SUPPORTS the
 * floor thesis, while negative / declining FCF and rising leverage are a strong
 * value-trap signal.
 *
 * Honest framing (per the spec): good cash flow does NOT by itself make a value
 * play a buy — but its *absence* (or deterioration) is a strong disqualifier. So
 * a clean, durable floor reads `pass`, a genuine deterioration signal reads
 * `flag`, and an ambiguous picture (e.g. positive FCF but a thin yield, or no
 * FCF level at all) stays `na` — never a false green-check. The figures are
 * evidence the human + the value red-team weigh, not a verdict.
 *
 * Plain module (no `server-only`) so the client checklist + detail view and the
 * server red-team share the same thresholds + assessment. Pure + unit-tested
 * (`cash-flow.test.ts`).
 */
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import type { CheckStatus } from "@/lib/checklist";
import type { CashFlowQuality } from "@/lib/types";

export type CashFlowTrend = NonNullable<CashFlowQuality["fcfTrend"]>;

/**
 * The floors a value play's cash flow should clear. Deliberately lenient — these
 * gate a *clean pass* vs a *deterioration flag*, not a hard rail. A value play
 * can still be sound below a threshold; it just won't green-check.
 */
export const CASH_FLOW_THRESHOLDS = {
  /** FCF yield (FCF ÷ market cap) at/above this reads as a healthy floor. */
  fcfYieldHealthy: 0.03,
  /** Debt-to-equity above this is heavy leverage — a value-trap weight. */
  debtToEquityHeavy: 2,
  /** Interest coverage (EBIT ÷ interest) below this is thin — a trap weight. */
  interestCoverageWeak: 3,
} as const;

export interface CashFlowAssessment {
  status: CheckStatus;
  /** A short right-aligned note for the checklist row. */
  detail: string;
  /** The deterioration signals found (empty for a pass / na). */
  reasons: string[];
}

const TREND_LABEL: Record<CashFlowTrend, string> = {
  growing: "Growing",
  stable: "Stable",
  declining: "Declining",
};

/** Short label for the FCF trend, or "—" when unknown. */
export function cashFlowTrendLabel(
  trend: CashFlowQuality["fcfTrend"],
): string {
  return trend ? TREND_LABEL[trend] : "—";
}

/** True when the block carries at least one usable figure. */
export function hasCashFlowData(cf: CashFlowQuality | null): boolean {
  if (!cf) return false;
  return (
    cf.operatingCashFlow !== null ||
    cf.freeCashFlow !== null ||
    cf.fcfTrend !== null ||
    cf.fcfYield !== null ||
    cf.netDebt !== null ||
    cf.debtToEquity !== null ||
    cf.interestCoverage !== null
  );
}

/**
 * Assess cash-flow quality for the value checklist + red-team. Returns:
 * - **flag** when any deterioration signal is present (negative or declining
 *   FCF, heavy leverage, or thin interest coverage) — the value-trap weight;
 * - **pass** when there is a clean floor: positive, non-declining FCF with a
 *   healthy-or-unknown yield and manageable-or-unknown leverage;
 * - **na** otherwise (no data, or an ambiguous middle) — never a false pass.
 */
export function assessCashFlowQuality(
  cf: CashFlowQuality | null,
): CashFlowAssessment {
  if (!hasCashFlowData(cf) || !cf) {
    return { status: "na", detail: "—", reasons: [] };
  }

  const reasons: string[] = [];
  if (cf.freeCashFlow !== null && cf.freeCashFlow <= 0) {
    reasons.push("FCF negative");
  }
  if (cf.fcfTrend === "declining") {
    reasons.push("FCF declining");
  }
  if (
    cf.debtToEquity !== null &&
    cf.debtToEquity > CASH_FLOW_THRESHOLDS.debtToEquityHeavy
  ) {
    reasons.push(`high leverage (D/E ${cf.debtToEquity.toFixed(1)})`);
  }
  if (
    cf.interestCoverage !== null &&
    cf.interestCoverage < CASH_FLOW_THRESHOLDS.interestCoverageWeak
  ) {
    reasons.push(`thin coverage (${cf.interestCoverage.toFixed(1)}×)`);
  }

  if (reasons.length > 0) {
    return { status: "flag", detail: reasons[0], reasons };
  }

  const positiveFcf = cf.freeCashFlow !== null && cf.freeCashFlow > 0;
  const yieldHealthy =
    cf.fcfYield === null ||
    cf.fcfYield >= CASH_FLOW_THRESHOLDS.fcfYieldHealthy;
  if (positiveFcf && yieldHealthy) {
    return { status: "pass", detail: cleanFloorDetail(cf), reasons: [] };
  }

  // Positive FCF but a known-thin yield, or no FCF level at all: not a clean
  // floor and not a deterioration — stay neutral.
  return { status: "na", detail: ambiguousDetail(cf), reasons: [] };
}

/** "$1.2B FCF · 4.5% yield" — the supportive figures for a passing floor. */
function cleanFloorDetail(cf: CashFlowQuality): string {
  const parts: string[] = [];
  if (cf.freeCashFlow !== null) {
    parts.push(`${formatCompactCurrency(cf.freeCashFlow)} FCF`);
  }
  if (cf.fcfYield !== null) {
    parts.push(`${formatPercent(cf.fcfYield, { signed: false })} yield`);
  }
  return parts.length > 0 ? parts.join(" · ") : "positive FCF";
}

/** A short honest note for the ambiguous middle. */
function ambiguousDetail(cf: CashFlowQuality): string {
  if (
    cf.freeCashFlow !== null &&
    cf.freeCashFlow > 0 &&
    cf.fcfYield !== null
  ) {
    return `thin yield (${formatPercent(cf.fcfYield, { signed: false })})`;
  }
  return "limited cash-flow data";
}
