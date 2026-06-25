/**
 * Shared symbol-view constants and types. Plain module (NOT `server-only`) so
 * both the server resolver (`lib/server/symbol.ts`) and client components
 * (the price chart) can import it — see the server-only rule in `.agents/nextjs.md`.
 */

export const SYMBOL_RANGES = ["1D", "1W", "1M", "3M", "1Y"] as const;
export type SymbolRange = (typeof SYMBOL_RANGES)[number];
export const DEFAULT_RANGE: SymbolRange = "3M";

/** A symbol is 1–12 chars of upper-case letters, digits, dot or dash. */
export const SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,12}$/;

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidSymbol(raw: string): boolean {
  return SYMBOL_PATTERN.test(raw);
}

export interface SymbolPricePoint {
  /** RFC3339 bar timestamp. */
  t: string;
  /** Open. */
  o: number;
  /** High. */
  h: number;
  /** Low. */
  l: number;
  /** Close. */
  c: number;
  /** Volume. */
  v: number;
}

/**
 * Map a 0–1 fraction across the chart's plotting area to the nearest bar index.
 * Pure so the hover crosshair's snapping is unit-tested without a DOM. Clamps
 * out-of-range fractions to the first/last bar; returns 0 for a degenerate series.
 */
export function nearestIndex(plotFraction: number, count: number): number {
  if (count <= 1) return 0;
  const clamped = Math.min(1, Math.max(0, plotFraction));
  return Math.round(clamped * (count - 1));
}

export interface SymbolQuote {
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  prevClose: number | null;
  volume: number | null;
  week52High: number | null;
  week52Low: number | null;
  asOf: string | null;
}

export interface SymbolNewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

export interface SymbolDetail {
  symbol: string;
  /** True when keys are present AND at least the chart or quote loaded. */
  available: boolean;
  range: SymbolRange;
  quote: SymbolQuote | null;
  bars: SymbolPricePoint[];
  news: SymbolNewsItem[];
  /** Non-null when live data is missing/partial — drives the degraded notice. */
  notice: string | null;
}
