/**
 * Market-scanner constants + types, shared by client and server (no
 * `server-only` here so the Scanner page and the server engine can both import
 * it). The server-only CLI bridge that actually spawns the Robinhood scanner
 * tool lives in `src/lib/server/scanner.ts`.
 *
 * The scanner is a **discovery funnel only**. It surfaces candidate symbols +
 * indicative metrics; it places nothing, and its prices are NOT authoritative —
 * every candidate is re-priced through Alpaca when it enters the analyze
 * pipeline (charter: prices stay Alpaca-only). Adds to the watchlist are
 * tracking-only and bounded by `DISCOVERY_LIMITS.maxWatchlistSymbols`.
 */

export const SCAN_PRESETS = ["trend", "value", "earnings-soon", "custom"] as const;
export type ScanPreset = (typeof SCAN_PRESETS)[number];

/** A scan request's filter set. Nulls mean "don't filter on this dimension." */
export interface ScanFilters {
  /** RSI(14) lower bound (inclusive), 0–100. */
  rsiMin: number | null;
  /** RSI(14) upper bound (inclusive), 0–100. */
  rsiMax: number | null;
  /** Minimum relative volume (entry-day ÷ trailing average), e.g. 1.3. */
  minRelativeVolume: number | null;
  /** Minimum market cap (USD) — a liquidity floor that filters out micro-caps. */
  minMarketCap: number | null;
  /** Only names with earnings within this many days (1–90). */
  earningsWithinDays: number | null;
  /** Max rows to return (1–{@link SCAN_RESULT_LIMIT_MAX}). */
  limit: number;
}

/** One scanner hit. Numeric/text fields are indicative discovery metadata, not
 *  authoritative quotes — the analyze pipeline re-prices via Alpaca. */
export interface ScanResult {
  symbol: string;
  sector: string | null;
  /** Indicative last price from the scanner (NOT used for sizing/pricing). */
  price: number | null;
  rsi: number | null;
  relativeVolume: number | null;
  /** Next earnings date, ISO `YYYY-MM-DD`, when the scanner provides it. */
  earningsDate: string | null;
  marketCap: number | null;
  peRatio: number | null;
}

export interface ScanResponse {
  ok: boolean;
  preset: ScanPreset;
  filters: ScanFilters;
  results: ScanResult[];
  count: number;
}

/** Hard ceiling on rows (bounds the funnel + the CLI output we parse). */
export const SCAN_RESULT_LIMIT_MAX = 50;
export const SCAN_RESULT_LIMIT_DEFAULT = 25;

/** RSI band a TREND name should sit in: trending up, but not yet blow-off
 *  overbought. Mirrors the trend mandate (momentum, not exhaustion). */
const TREND_RSI_MIN = 50;
const TREND_RSI_MAX = 80;
/** Volume confirmation a trend breakout needs — the desk's breakout threshold
 *  (`REL_VOLUME_BREAKOUT_MIN` is 1.3 in `lib/volume.ts`; kept in lockstep). */
const TREND_MIN_REL_VOLUME = 1.3;
/** Liquidity floor for the TREND preset — the Robinhood scanner has no
 *  price-vs-SMA filter, so a market-cap floor (instead of the old "above the
 *  50/200-day" gate) keeps the momentum screen on liquid, investable names. */
const TREND_MIN_MARKET_CAP = 2_000_000_000;
/** Oversold ceiling for the VALUE / mean-reversion lens. */
const VALUE_RSI_MAX = 35;
/** Default earnings window for the catalyst preset. */
const EARNINGS_WINDOW_DAYS = 14;
/** Max earnings look-ahead the human may set. */
const EARNINGS_MAX_DAYS = 90;
/** Upper bound for the market-cap floor (≈ the largest US mega-cap). */
const MARKET_CAP_MAX = 1e13;

/** Preset → default filters. `custom` has no preset (caller supplies filters). */
export const PRESET_FILTERS: Record<Exclude<ScanPreset, "custom">, ScanFilters> = {
  trend: {
    rsiMin: TREND_RSI_MIN,
    rsiMax: TREND_RSI_MAX,
    minRelativeVolume: TREND_MIN_REL_VOLUME,
    minMarketCap: TREND_MIN_MARKET_CAP,
    earningsWithinDays: null,
    limit: SCAN_RESULT_LIMIT_DEFAULT,
  },
  value: {
    rsiMin: null,
    rsiMax: VALUE_RSI_MAX,
    minRelativeVolume: null,
    minMarketCap: null,
    earningsWithinDays: null,
    limit: SCAN_RESULT_LIMIT_DEFAULT,
  },
  "earnings-soon": {
    rsiMin: null,
    rsiMax: null,
    minRelativeVolume: null,
    // The Robinhood UPCOMING_EARNINGS universe is dominated by micro-cap funds,
    // so a liquidity floor keeps the catalyst funnel on investable names.
    minMarketCap: TREND_MIN_MARKET_CAP,
    earningsWithinDays: EARNINGS_WINDOW_DAYS,
    limit: SCAN_RESULT_LIMIT_DEFAULT,
  },
};

export const PRESET_LABEL: Record<ScanPreset, string> = {
  trend: "Trend (momentum)",
  value: "Value (oversold)",
  "earnings-soon": "Earnings soon",
  custom: "Custom",
};

export const PRESET_DESCRIPTION: Record<ScanPreset, string> = {
  trend:
    "RSI 50–80, ≥1.3× relative volume, ≥$2B market cap — liquid trend-lens momentum candidates.",
  value: "Oversold (RSI ≤ 35) — value / mean-reversion candidates near lows.",
  "earnings-soon":
    "Earnings within 14 days, ≥$2B market cap — catalyst-driven names (mind the earnings-gap risk).",
  custom: "Set the RSI / volume / earnings filters yourself.",
};

/** Default empty/custom filters. */
export function emptyFilters(): ScanFilters {
  return {
    rsiMin: null,
    rsiMax: null,
    minRelativeVolume: null,
    minMarketCap: null,
    earningsWithinDays: null,
    limit: SCAN_RESULT_LIMIT_DEFAULT,
  };
}

/** Narrow an untrusted value to a {@link ScanPreset}; defaults to `trend`. */
export function parseScanPreset(raw: unknown): ScanPreset {
  return (SCAN_PRESETS as readonly string[]).includes(raw as string)
    ? (raw as ScanPreset)
    : "trend";
}

/** Filters for a preset (`custom` → empty filters the caller overrides). */
export function filtersForPreset(preset: ScanPreset): ScanFilters {
  return preset === "custom" ? emptyFilters() : { ...PRESET_FILTERS[preset] };
}

function clampNum(
  v: unknown,
  lo: number,
  hi: number,
  fallback: number | null,
): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return fallback;
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Coerce an untrusted partial filter set into a safe, bounded {@link ScanFilters}
 * — RSI clamped to 0–100, relative volume ≥ 0, the earnings window 1–90 days, and
 * the row limit 1–{@link SCAN_RESULT_LIMIT_MAX}. Unknown/garbage values fall back
 * to "no filter" rather than throwing.
 */
export function clampFilters(input: Partial<ScanFilters> | null | undefined): ScanFilters {
  const f = input ?? {};
  return {
    rsiMin: clampNum(f.rsiMin, 0, 100, null),
    rsiMax: clampNum(f.rsiMax, 0, 100, null),
    minRelativeVolume: clampNum(f.minRelativeVolume, 0, 100, null),
    minMarketCap: clampNum(f.minMarketCap, 0, MARKET_CAP_MAX, null),
    earningsWithinDays: clampNum(f.earningsWithinDays, 1, EARNINGS_MAX_DAYS, null),
    limit:
      clampNum(f.limit, 1, SCAN_RESULT_LIMIT_MAX, SCAN_RESULT_LIMIT_DEFAULT) ??
      SCAN_RESULT_LIMIT_DEFAULT,
  };
}

/**
 * Resolve a request `{ preset, filters }` into the effective, bounded filters:
 * start from the preset defaults, apply any explicit overrides, then clamp. For
 * `custom`, the overrides are the whole filter set.
 */
export function resolveScanFilters(
  preset: ScanPreset,
  overrides?: Partial<ScanFilters> | null,
): ScanFilters {
  const base = filtersForPreset(preset);
  return clampFilters({ ...base, ...(overrides ?? {}) });
}
