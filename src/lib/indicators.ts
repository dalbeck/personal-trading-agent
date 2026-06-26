/**
 * Pure technical indicators for the manual "analyze a symbol" pipeline (M2).
 * Computed from Alpaca daily OHLCV bars (the charter's only price source), with
 * no I/O, so they are unit-tested in isolation and reused by the proposal
 * builder. Trend / momentum / volatility here drive the technical thesis,
 * stop, and conviction score — never order pricing beyond the latest close.
 */

/** The OHLCV fields the indicators need — a structural subset of
 *  `AlpacaOhlcBar`, so an Alpaca bar array is accepted directly. */
export interface Ohlc {
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: string;
}

/** Simple moving average of the trailing `period` values. Null when there are
 *  fewer than `period` samples (never a partial/misleading average). */
export function sma(values: number[], period: number): number | null {
  if (period <= 0 || values.length < period) return null;
  const window = values.slice(values.length - period);
  return window.reduce((sum, v) => sum + v, 0) / period;
}

/**
 * Average True Range over the last `period` bars (Wilder's true range, simple
 * mean). True range per bar is the greatest of: high−low, |high−prevClose|,
 * |low−prevClose| — so gaps count. Needs `period + 1` bars (the first bar has
 * no prior close); returns null otherwise.
 */
export function atr(bars: Ohlc[], period: number): number | null {
  if (period <= 0 || bars.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prevClose = bars[i - 1].c;
    const tr = Math.max(
      cur.h - cur.l,
      Math.abs(cur.h - prevClose),
      Math.abs(cur.l - prevClose),
    );
    trs.push(tr);
  }
  const window = trs.slice(trs.length - period);
  return window.reduce((sum, v) => sum + v, 0) / period;
}
