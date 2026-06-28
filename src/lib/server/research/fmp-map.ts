/**
 * Pure mappers that translate Financial Modeling Prep (FMP) **stable** API JSON
 * responses into the repo's existing research shapes. No fetch, no server-only —
 * fully unit-testable.
 *
 * Targets the stable API (`/stable/...`, query-param style) — the legacy v3
 * routes 403 "Legacy Endpoint" for keys issued after 2025-08-31. Field names
 * were verified against live stable payloads (see the spec's live-probe
 * findings): profile uses `marketCap`/`exchange` (was `mktCap`/`exchangeShortName`);
 * ratios-ttm uses `priceToEarningsRatioTTM` / `debtToEquityRatioTTM` /
 * `interestCoverageRatioTTM` / `dividendPayoutRatioTTM` (was the un-prefixed
 * forms); cash-flow uses `netDividendsPaid` (was `dividendsPaid`); the dividends
 * endpoint returns a **flat array** (was `{ historical: [...] }`).
 *
 * Statement endpoints return arrays; we defensively read [0]. A missing /
 * renamed field → null (never throws). Each group returns null when no usable
 * field exists, mirroring the `hasAny` pattern in parse.ts.
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
 * The parsed JSON bodies returned by FMP **stable** endpoints. Each field
 * matches what FMP's JSON body looks like after `await res.json()`:
 * - profile / ratios-ttm / key-metrics-ttm / cash-flow-statement /
 *   balance-sheet-statement → arrays
 * - dividends → a flat array `[{ date, dividend, ... }, ...]`
 */
export type FmpRaw = {
  profile?: unknown;
  ratiosTtm?: unknown;
  keyMetricsTtm?: unknown;
  cashFlow?: unknown;
  balanceSheet?: unknown;
  /** Stable `dividends` payload: a flat array (legacy `{ historical: [...] }`
   *  is still accepted by `dividendStreakAndCagr` for back-compat). */
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
 * Accepts either the **stable** flat array `[{ date, dividend }, ...]` or the
 * legacy `{ historical: [{ date, dividend }, ...] }` shape (both desc order, as
 * FMP returns them).
 */
export function dividendStreakAndCagr(historical: unknown): {
  growthStreakYears: number | null;
  dividendCagr: number | null;
} {
  const nil = { growthStreakYears: null, dividendCagr: null };

  // Stable returns a bare array; legacy wraps it in `{ historical: [...] }`.
  const rows = Array.isArray(historical)
    ? historical
    : historical && typeof historical === "object"
      ? (historical as Record<string, unknown>).historical
      : null;
  if (!Array.isArray(rows)) return nil;

  // Sum dividends and count payments per calendar year
  const byYear = new Map<number, { total: number; count: number }>();
  for (const entry of rows) {
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
    // stable: `exchange` (e.g. "NASDAQ"); legacy used `exchangeShortName`
    exchange: coerceStr(p.exchange ?? p.exchangeShortName),
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

  // marketCap: stable exposes it on both profile (`marketCap`) and key-metrics
  // (`marketCap`, was `marketCapTTM` on v3). Prefer profile, fall back to either.
  const marketCap =
    coerceMoneyLike(prof?.marketCap ?? prof?.mktCap) ??
    coerceMoneyLike(km?.marketCap ?? km?.marketCapTTM);

  const result: ResearchFundamentals = {
    marketCap,
    // stable: `priceToEarningsRatioTTM` (was `peRatioTTM`)
    peRatio: coerceNumberLike(ratios?.priceToEarningsRatioTTM ?? ratios?.peRatioTTM),
    // stable: EPS lives on ratios-ttm as `netIncomePerShareTTM`
    eps: coerceNumberLike(ratios?.netIncomePerShareTTM ?? km?.netIncomePerShareTTM),
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
  balanceSheetArr: unknown,
): CashFlowQuality | null {
  const ratios = firstElem(ratiosTtmArr);
  const km = firstElem(keyMetricsTtmArr);
  const cf0 = firstElem(cashFlowArr);
  const bs0 = firstElem(balanceSheetArr);

  const result: CashFlowQuality = {
    operatingCashFlow: coerceMoneyLike(cf0?.operatingCashFlow),
    freeCashFlow: coerceMoneyLike(cf0?.freeCashFlow),
    fcfTrend: fcfTrendFromRows(cashFlowArr),
    // freeCashFlowYieldTTM is already a fraction — coerceNumberLike
    fcfYield: coerceNumberLike(km?.freeCashFlowYieldTTM),
    // stable exposes netDebt directly on the balance sheet (was left null on v3)
    netDebt: coerceMoneyLike(bs0?.netDebt),
    // stable: `debtToEquityRatioTTM` / `interestCoverageRatioTTM` (was un-prefixed)
    debtToEquity: coerceNumberLike(ratios?.debtToEquityRatioTTM ?? ratios?.debtEquityRatioTTM),
    interestCoverage: coerceNumberLike(
      ratios?.interestCoverageRatioTTM ?? ratios?.interestCoverageTTM,
    ),
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

  // dividendYieldTTM and the payout ratio are fractions → coerceNumberLike.
  // stable: `dividendPayoutRatioTTM` (was `payoutRatioTTM`).
  const dividendYield = coerceNumberLike(ratios?.dividendYieldTTM);
  const payoutRatio = coerceNumberLike(
    ratios?.dividendPayoutRatioTTM ?? ratios?.payoutRatioTTM,
  );

  // FCF payout = abs(dividends paid) / freeCashFlow. stable: `netDividendsPaid`
  // / `commonDividendsPaid` (v3 `dividendsPaid` is now null).
  const freeCashFlow = coerceMoneyLike(cf0?.freeCashFlow);
  const dividendsPaid = coerceMoneyLike(
    cf0?.netDividendsPaid ?? cf0?.commonDividendsPaid ?? cf0?.dividendsPaid,
  );

  let fcfPayout: number | null = null;
  let fcfCoverage: number | null = null;

  // Only meaningful when the company actually pays a dividend. A non-payer
  // reports dividendsPaid 0, and abs(0) would make coverage divide by zero
  // (→ Infinity, which the proposal schema rejects, crashing analyze).
  const absDivPaid =
    dividendsPaid !== null && Math.abs(dividendsPaid) > 0
      ? Math.abs(dividendsPaid)
      : null;
  if (absDivPaid !== null && freeCashFlow !== null && freeCashFlow !== 0) {
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

  // A company that pays no dividend (zero/absent yield + payout, no dividends
  // paid) carries no value-floor signal — emit null rather than a block of
  // zeros so the dividend floor stays "na" instead of a phantom assessment.
  const paysDividend =
    (dividendYield !== null && dividendYield > 0) ||
    (payoutRatio !== null && payoutRatio > 0) ||
    absDivPaid !== null;
  const hasSignal =
    paysDividend || growthStreakYears !== null || dividendCagr !== null;
  return hasSignal ? result : null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Map FMP **stable** raw JSON responses into the repo's research shapes. Each
 * group is independently null-able — a missing or broken endpoint returns null
 * for that group without affecting the others. Never throws.
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
      cashFlow: mapCashFlow(
        raw.ratiosTtm,
        raw.keyMetricsTtm,
        raw.cashFlow,
        raw.balanceSheet,
      ),
      dividend: mapDividend(raw.ratiosTtm, raw.cashFlow, raw.dividendHistory),
    };
  } catch {
    return { fundamentals: null, profile: null, cashFlow: null, dividend: null };
  }
}
