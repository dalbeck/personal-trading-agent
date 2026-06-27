/**
 * Pure mappers that translate Financial Modeling Prep (FMP) v3 JSON responses
 * into the repo's existing research shapes. No fetch, no server-only — fully
 * unit-testable.
 *
 * FMP v3 endpoints return arrays; we defensively read [0]. A missing / renamed
 * field → null (never throws). Each group returns null when no usable field
 * exists, mirroring the `hasAny` pattern in parse.ts.
 */

import type { CashFlowQuality, DividendSignals } from "@/lib/types";
import type { ResearchFundamentals, ResearchProfile } from "./types";
import {
  coerceDomain,
  coerceIntLike,
  coerceMoneyLike,
  coerceNumberLike,
  coerceStr,
} from "./parse";

// ---------------------------------------------------------------------------
// Public input type
// ---------------------------------------------------------------------------

/**
 * The parsed JSON bodies returned by FMP v3 endpoints. Each field matches what
 * FMP's JSON body looks like after `await res.json()`:
 * - profile / ratios-ttm / key-metrics-ttm / cash-flow-statement → arrays
 * - dividends → `{ historical: [...] }`
 */
export type FmpRaw = {
  profile?: unknown;
  ratiosTtm?: unknown;
  keyMetricsTtm?: unknown;
  cashFlow?: unknown;
  dividendHistory?: unknown;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function firstElem(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) return null;
  const elem = value[0];
  if (!elem || typeof elem !== "object") return null;
  return elem as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Exported helpers (unit-tested directly)
// ---------------------------------------------------------------------------

/**
 * Derive FCF trend from an array of annual cash-flow rows (newest-first).
 * Compares latest freeCashFlow to the prior year's:
 *   latest > prior * 1.05 → "growing"
 *   latest < prior * 0.95 → "declining"
 *   otherwise            → "stable"
 * Returns null when there are fewer than 2 finite rows.
 */
export function fcfTrendFromRows(
  rows: unknown,
): "growing" | "stable" | "declining" | null {
  if (!Array.isArray(rows)) return null;

  // Collect finite freeCashFlow values from oldest-to-newest (reversed order
  // relative to how FMP returns them — newest-first in the array).
  let latestFcf: number | null = null;
  let priorFcf: number | null = null;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const val = coerceMoneyLike((row as Record<string, unknown>).freeCashFlow);
    if (val === null) continue;
    if (latestFcf === null) {
      latestFcf = val; // rows[0] is newest
    } else if (priorFcf === null) {
      priorFcf = val; // rows[1] is next older
      break;
    }
  }

  if (latestFcf === null || priorFcf === null) return null;

  if (latestFcf > priorFcf * 1.05) return "growing";
  if (latestFcf < priorFcf * 0.95) return "declining";
  return "stable";
}

/**
 * Aggregate dividend history into annual totals and compute:
 *   - growthStreakYears: consecutive most-recent FULL calendar years where the
 *     annual total >= the next-older year
 *   - dividendCagr: (latest / oldest) ** (1 / span) - 1 over up to 5 full
 *     years; null when < 2 full years or non-positive endpoints
 *
 * Input shape: `{ historical: [{ date: string; dividend: number }, ...] }`
 * (desc order, as FMP returns it).
 */
export function dividendStreakAndCagr(historical: unknown): {
  growthStreakYears: number | null;
  dividendCagr: number | null;
} {
  const nil = { growthStreakYears: null, dividendCagr: null };

  if (!historical || typeof historical !== "object") return nil;
  const h = historical as Record<string, unknown>;
  if (!Array.isArray(h.historical)) return nil;

  // Sum dividends and count payments per calendar year
  const byYear = new Map<number, { total: number; count: number }>();
  for (const entry of h.historical) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const dateStr = coerceStr(e.date);
    const amount = coerceNumberLike(e.dividend);
    if (!dateStr || amount === null) continue;
    const year = parseInt(dateStr.slice(0, 4), 10);
    if (!Number.isFinite(year)) continue;
    const existing = byYear.get(year) ?? { total: 0, count: 0 };
    byYear.set(year, { total: existing.total + amount, count: existing.count + 1 });
  }

  if (byYear.size < 2) return nil;

  // Sort years descending so [0] = most recent year
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);

  // Drop the newest year if it has fewer payments than the next-older year
  // (indicates a partial/incomplete current year mid-stream).
  if (
    years.length >= 2 &&
    byYear.get(years[0])!.count < byYear.get(years[1])!.count
  ) {
    byYear.delete(years[0]);
    years.shift();
  }

  if (years.length < 2) return nil;

  // Compute growth streak (consecutive years where total[y] >= total[y+1])
  let streak = 0;
  for (let i = 0; i < years.length - 1; i++) {
    const current = byYear.get(years[i])!.total;
    const older = byYear.get(years[i + 1])!.total;
    if (current >= older) {
      streak++;
    } else {
      break;
    }
  }

  // CAGR over up to 5 full years
  const cagr = (() => {
    if (years.length < 2) return null;
    const span = Math.min(years.length - 1, 5);
    const latestTotal = byYear.get(years[0])!.total;
    const oldestTotal = byYear.get(years[span])!.total;
    if (latestTotal <= 0 || oldestTotal <= 0) return null;
    return Math.pow(latestTotal / oldestTotal, 1 / span) - 1;
  })();

  return {
    growthStreakYears: streak > 0 ? streak : null,
    dividendCagr: cagr,
  };
}

// ---------------------------------------------------------------------------
// Group mappers
// ---------------------------------------------------------------------------

function mapProfile(
  profileArr: unknown,
): ResearchProfile | null {
  const p = firstElem(profileArr);
  if (!p) return null;

  const result: ResearchProfile = {
    name: coerceStr(p.companyName),
    domain: coerceDomain(p.website),
    ceo: coerceStr(p.ceo),
    employees: coerceIntLike(p.fullTimeEmployees),
    sector: coerceStr(p.sector),
    industry: coerceStr(p.industry),
    country: coerceStr(p.country),
    exchange: coerceStr(p.exchangeShortName),
    ipoDate: coerceStr(p.ipoDate),
    description: coerceStr(p.description),
  };

  const hasAny = Object.values(result).some((v) => v !== null);
  return hasAny ? result : null;
}

function mapFundamentals(
  profileArr: unknown,
  ratiosTtmArr: unknown,
  keyMetricsTtmArr: unknown,
): ResearchFundamentals | null {
  const prof = firstElem(profileArr);
  const ratios = firstElem(ratiosTtmArr);
  const km = firstElem(keyMetricsTtmArr);

  // marketCap: profile.mktCap, fallback to key-metrics.marketCapTTM
  const marketCap =
    coerceMoneyLike(prof?.mktCap) ??
    coerceMoneyLike(km?.marketCapTTM);

  const result: ResearchFundamentals = {
    marketCap,
    peRatio: coerceNumberLike(ratios?.peRatioTTM),
    eps: coerceNumberLike(km?.netIncomePerShareTTM),
    // dividendYieldTTM is already a fraction (0.0044) — use coerceNumberLike, NOT coercePercentLike
    dividendYield: coerceNumberLike(ratios?.dividendYieldTTM),
  };

  const hasAny = Object.values(result).some((v) => v !== null);
  return hasAny ? result : null;
}

function mapCashFlow(
  ratiosTtmArr: unknown,
  keyMetricsTtmArr: unknown,
  cashFlowArr: unknown,
): CashFlowQuality | null {
  const ratios = firstElem(ratiosTtmArr);
  const km = firstElem(keyMetricsTtmArr);
  const cf0 = firstElem(cashFlowArr);

  const result: CashFlowQuality = {
    operatingCashFlow: coerceMoneyLike(cf0?.operatingCashFlow),
    freeCashFlow: coerceMoneyLike(cf0?.freeCashFlow),
    fcfTrend: fcfTrendFromRows(cashFlowArr),
    // freeCashFlowYieldTTM is already a fraction — coerceNumberLike
    fcfYield: coerceNumberLike(km?.freeCashFlowYieldTTM),
    netDebt: null, // not populated in M2 (no balance-sheet call)
    debtToEquity: coerceNumberLike(ratios?.debtEquityRatioTTM),
    interestCoverage: coerceNumberLike(ratios?.interestCoverageTTM),
  };

  const hasAny = Object.values(result).some((v) => v !== null);
  return hasAny ? result : null;
}

function mapDividend(
  ratiosTtmArr: unknown,
  cashFlowArr: unknown,
  dividendHistory: unknown,
): DividendSignals | null {
  const ratios = firstElem(ratiosTtmArr);
  const cf0 = firstElem(cashFlowArr);

  // dividendYieldTTM and payoutRatioTTM are fractions → coerceNumberLike
  const dividendYield = coerceNumberLike(ratios?.dividendYieldTTM);
  const payoutRatio = coerceNumberLike(ratios?.payoutRatioTTM);

  // FCF payout = abs(dividendsPaid) / freeCashFlow
  const freeCashFlow = coerceMoneyLike(cf0?.freeCashFlow);
  const dividendsPaid = coerceMoneyLike(cf0?.dividendsPaid);

  let fcfPayout: number | null = null;
  let fcfCoverage: number | null = null;

  if (
    dividendsPaid !== null &&
    freeCashFlow !== null &&
    freeCashFlow !== 0
  ) {
    const absDivPaid = Math.abs(dividendsPaid);
    fcfPayout = absDivPaid / freeCashFlow;
    fcfCoverage = freeCashFlow / absDivPaid;
  }

  const { growthStreakYears, dividendCagr } =
    dividendStreakAndCagr(dividendHistory);

  const result: DividendSignals = {
    dividendYield,
    payoutRatio,
    fcfPayout,
    fcfCoverage,
    growthStreakYears,
    dividendCagr,
  };

  const hasAny = Object.values(result).some((v) => v !== null);
  return hasAny ? result : null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Map FMP v3 raw JSON responses into the repo's research shapes. Each group
 * is independently null-able — a missing or broken endpoint returns null for
 * that group without affecting the others. Never throws.
 */
export function mapFmpToResearch(raw: FmpRaw): {
  fundamentals: ResearchFundamentals | null;
  profile: ResearchProfile | null;
  cashFlow: CashFlowQuality | null;
  dividend: DividendSignals | null;
} {
  try {
    return {
      fundamentals: mapFundamentals(
        raw.profile,
        raw.ratiosTtm,
        raw.keyMetricsTtm,
      ),
      profile: mapProfile(raw.profile),
      cashFlow: mapCashFlow(raw.ratiosTtm, raw.keyMetricsTtm, raw.cashFlow),
      dividend: mapDividend(raw.ratiosTtm, raw.cashFlow, raw.dividendHistory),
    };
  } catch {
    return { fundamentals: null, profile: null, cashFlow: null, dividend: null };
  }
}
