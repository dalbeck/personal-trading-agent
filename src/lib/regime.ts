/**
 * Market-regime context (M4) — a **light, advisory** read of the macro backdrop
 * so proposals lean with where money is rotating, not against it. It is **never
 * a rail or a gate**: it leans on the same signals the desk already trusts (SPY
 * trend, the VIX emergency-stop input, and sector-ETF relative performance) and
 * is surfaced as a one-line context note in the pre-market output and on the
 * dashboard. Plain module (no `server-only`) so the math + display rules are
 * unit-tested and shared by the server resolver and client renderers.
 */

/** The SPDR sector ETFs we rank for rotation (vs SPY). */
export const SECTOR_ETFS: { symbol: string; name: string }[] = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLC", name: "Communication Services" },
  { symbol: "XLY", name: "Consumer Discretionary" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLV", name: "Health Care" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLP", name: "Consumer Staples" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLRE", name: "Real Estate" },
];

/** Trailing window (trading days) for sector relative performance. ~3 months. */
export const ROTATION_LOOKBACK = 63;
/** How many leaders / laggards the summary names. */
export const ROTATION_TOP_N = 3;

export type TrendState = "uptrend" | "range" | "downtrend";
export type VixBand = "calm" | "normal" | "elevated" | "stressed";

export interface SectorRank {
  symbol: string;
  name: string;
  /** Trailing return of the sector ETF over the lookback (fraction). */
  returnPct: number;
  /** Sector return minus SPY return over the same window (fraction). */
  relativePct: number;
}

export interface RegimeContext {
  trend: TrendState;
  /** SPY VIX level used for the band; null when unavailable. */
  vix: number | null;
  vixBand: VixBand;
  leaders: SectorRank[];
  laggards: SectorRank[];
  /** One-line advisory summary. */
  summary: string;
  /** When the read was computed (ISO). */
  asOf: string;
  /** True when SPY trend or sector ranking could not be computed (data gap). */
  degraded: boolean;
}

/** Simple moving average of the last `period` values, or null if too few. */
export function sma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;
  const window = values.slice(-period);
  return window.reduce((a, v) => a + v, 0) / period;
}

/** Trailing return over `lookback` bars (last vs `lookback` bars ago), or null. */
export function trailingReturn(closes: number[], lookback: number): number | null {
  if (closes.length < lookback + 1) return null;
  const last = closes[closes.length - 1];
  const past = closes[closes.length - 1 - lookback];
  if (!(past > 0)) return null;
  return (last - past) / past;
}

/**
 * Classify SPY trend from a daily close series (oldest → newest). Uptrend: price
 * above a rising 50-day and above the 200-day. Downtrend: price below a falling
 * 50-day or below the 200-day. Everything else (incl. too-short history) is a
 * range — the neutral read.
 */
export function classifyTrend(closes: number[]): TrendState {
  const price = closes[closes.length - 1];
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const sma50Prior = sma(closes.slice(0, -10), 50); // ~2 weeks earlier
  if (price == null || sma50 == null || sma200 == null || sma50Prior == null) {
    return "range";
  }
  const sma50Rising = sma50 > sma50Prior;
  if (price > sma50 && sma50Rising && price > sma200) return "uptrend";
  if (price < sma50 && (!sma50Rising || price < sma200)) return "downtrend";
  return "range";
}

/** Band the VIX. Mirrors the charter emergency-stop sense (>30 is stress). */
export function vixBand(vix: number | null): VixBand {
  if (vix == null) return "normal";
  if (vix < 15) return "calm";
  if (vix < 20) return "normal";
  if (vix <= 30) return "elevated";
  return "stressed";
}

/**
 * Rank sectors by relative performance vs SPY (sector return − SPY return),
 * best first. Sectors with no computable return are dropped.
 */
export function rankSectors(
  sectors: { symbol: string; name: string; returnPct: number | null }[],
  spyReturnPct: number | null,
): SectorRank[] {
  const spy = spyReturnPct ?? 0;
  return sectors
    .filter((s): s is { symbol: string; name: string; returnPct: number } =>
      s.returnPct != null && Number.isFinite(s.returnPct),
    )
    .map((s) => ({
      symbol: s.symbol,
      name: s.name,
      returnPct: s.returnPct,
      relativePct: s.returnPct - spy,
    }))
    .sort((a, b) => b.relativePct - a.relativePct);
}

const TREND_PHRASE: Record<TrendState, string> = {
  uptrend: "SPY in an uptrend",
  range: "SPY ranging / no clear trend",
  downtrend: "SPY in a downtrend",
};

/** "Risk-on" / "mixed" / "risk-off" one-word read from trend + VIX. */
export function regimeStance(trend: TrendState, band: VixBand): string {
  if (band === "stressed") return "Risk-off";
  if (trend === "uptrend" && (band === "calm" || band === "normal")) return "Risk-on";
  if (trend === "downtrend" || band === "elevated") return "Risk-off";
  return "Mixed";
}

/** Build the one-line advisory summary from the parts. */
export function buildRegimeSummary(
  trend: TrendState,
  vix: number | null,
  band: VixBand,
  leaders: SectorRank[],
  laggards: SectorRank[],
): string {
  const stance = regimeStance(trend, band);
  const vixText = vix != null ? `VIX ${vix.toFixed(1)} (${band})` : `VIX ${band}`;
  const parts = [`${stance} backdrop — ${TREND_PHRASE[trend]}, ${vixText}.`];
  if (leaders.length > 0 && laggards.length > 0) {
    const names = (rs: SectorRank[]) => rs.map((r) => r.name).join(", ");
    parts.push(
      `Money rotating into ${names(leaders)}; out of ${names(laggards)}.`,
    );
  }
  parts.push("Advisory context only — not a rail or a gate.");
  return parts.join(" ");
}
