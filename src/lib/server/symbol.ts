import "server-only";

import {
  getStockBars,
  getStockNews,
  getStockSnapshot,
  hasAlpacaCredentials,
  type AlpacaNewsItem,
  type AlpacaOhlcBar,
  type AlpacaSnapshot,
  type BarsWindow,
} from "@/lib/server/alpaca";
import {
  type SymbolDetail,
  type SymbolNewsItem,
  type SymbolPricePoint,
  type SymbolQuote,
  type SymbolRange,
} from "@/lib/symbol";
import { computeRelativeVolume } from "@/lib/volume";

/**
 * Resolver for the `/symbol/[ticker]` view. Mirrors the account resolver's
 * honesty contract: prefer live Alpaca data, but **always render** — when keys
 * are absent or a call fails, return a degraded state with a clear notice so the
 * view falls back to the link-outs instead of fabricating a chart or quote.
 *
 * Alpaca (IEX feed) is the source for chart bars, the quote snapshot, and news.
 * Display / research only — never order pricing or execution. Shared
 * constants/types (ranges, the view contract) live in the plain `@/lib/symbol`
 * module so client components can import them too.
 */

const DAY_MS = 86_400_000;

/**
 * Map a range tab to an Alpaca bars window. Intraday minutes for 1D/1W, daily
 * bars beyond (per the spec). `sessionOnly` trims a multi-day intraday pull down
 * to the latest trading day so "1D" shows one session across weekends/holidays.
 */
export function rangeWindow(
  range: SymbolRange,
  now: Date,
): BarsWindow & { sessionOnly: boolean } {
  const startAgo = (days: number) =>
    new Date(now.getTime() - days * DAY_MS).toISOString();
  switch (range) {
    case "1D":
      return { timeframe: "5Min", start: startAgo(4), sessionOnly: true };
    case "1W":
      return { timeframe: "30Min", start: startAgo(8), sessionOnly: false };
    case "1M":
      return { timeframe: "1Day", start: startAgo(33), sessionOnly: false };
    case "3M":
      return { timeframe: "1Day", start: startAgo(95), sessionOnly: false };
    case "1Y":
      return { timeframe: "1Day", start: startAgo(370), sessionOnly: false };
  }
}

/** Map a raw Alpaca OHLCV bar to the chart's point contract (full OHLCV). */
export function barToPoint(bar: AlpacaOhlcBar): SymbolPricePoint {
  return { t: bar.t, o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v };
}

/** Keep only the bars on the most recent calendar date present (latest session). */
export function latestSessionOnly(bars: AlpacaOhlcBar[]): AlpacaOhlcBar[] {
  if (bars.length === 0) return bars;
  const lastDate = bars[bars.length - 1].t.slice(0, 10);
  return bars.filter((b) => b.t.slice(0, 10) === lastDate);
}

/** 52-week high/low from a year of bars (uses each bar's high/low). */
export function week52Range(bars: AlpacaOhlcBar[]): {
  high: number | null;
  low: number | null;
} {
  if (bars.length === 0) return { high: null, low: null };
  let high = -Infinity;
  let low = Infinity;
  for (const b of bars) {
    if (b.h > high) high = b.h;
    if (b.l < low) low = b.l;
  }
  return { high, low };
}

export function mapSnapshotToQuote(
  symbol: string,
  snap: AlpacaSnapshot,
  week: { high: number | null; low: number | null },
  relativeVolume: number | null = null,
): SymbolQuote {
  const daily = snap.dailyBar;
  const prevClose = snap.prevDailyBar?.c ?? null;
  const price = snap.latestTrade?.p ?? daily?.c ?? null;
  const change =
    price !== null && prevClose !== null ? price - prevClose : null;
  const changePct =
    change !== null && prevClose ? change / prevClose : null;
  return {
    symbol,
    price,
    change,
    changePct,
    open: daily?.o ?? null,
    dayHigh: daily?.h ?? null,
    dayLow: daily?.l ?? null,
    prevClose,
    volume: daily?.v ?? null,
    relativeVolume,
    week52High: week.high,
    week52Low: week.low,
    asOf: snap.latestTrade?.t ?? daily?.t ?? null,
  };
}

/**
 * Fallback quote from daily bars when the snapshot call fails but the year
 * series loaded — last bar is "today", the one before it is the prior close.
 */
export function quoteFromDailyBars(
  symbol: string,
  bars: AlpacaOhlcBar[],
  week: { high: number | null; low: number | null },
  relativeVolume: number | null = null,
): SymbolQuote | null {
  if (bars.length === 0) return null;
  const last = bars[bars.length - 1];
  const prevClose = bars.length > 1 ? bars[bars.length - 2].c : null;
  const change = prevClose !== null ? last.c - prevClose : null;
  const changePct = change !== null && prevClose ? change / prevClose : null;
  return {
    symbol,
    price: last.c,
    change,
    changePct,
    open: last.o,
    dayHigh: last.h,
    dayLow: last.l,
    prevClose,
    volume: last.v,
    relativeVolume,
    week52High: week.high,
    week52Low: week.low,
    asOf: last.t,
  };
}

export function mapNews(raw: AlpacaNewsItem[]): SymbolNewsItem[] {
  return raw
    .map((n) => ({
      id: n.id,
      title: n.headline,
      source: n.source,
      url: n.url,
      publishedAt: n.created_at,
    }))
    .filter((n) => n.title.length > 0);
}

/** Chart series for one range. Returns `[]` (never throws) when off/unavailable. */
export async function getSymbolBars(
  symbol: string,
  range: SymbolRange,
  opts?: { fetchImpl?: typeof fetch; now?: () => Date },
): Promise<SymbolPricePoint[]> {
  if (!hasAlpacaCredentials()) return [];
  const now = opts?.now?.() ?? new Date();
  const win = rangeWindow(range, now);
  try {
    const bars = await getStockBars(symbol, win, { fetchImpl: opts?.fetchImpl });
    const series = win.sessionOnly ? latestSessionOnly(bars) : bars;
    return series.map(barToPoint);
  } catch {
    return [];
  }
}

/**
 * Full symbol-view payload: chart bars for `range`, quote snapshot (with 52-week
 * range derived from a year of daily bars), and recent news. Each source fails
 * independently; the view degrades to whatever loaded and to the link-outs.
 */
export async function getSymbolDetail(
  symbol: string,
  range: SymbolRange,
  opts?: { fetchImpl?: typeof fetch; now?: () => Date },
): Promise<SymbolDetail> {
  if (!hasAlpacaCredentials()) {
    return {
      symbol,
      available: false,
      range,
      quote: null,
      bars: [],
      news: [],
      notice:
        "Live market data unavailable — connect Alpaca to load the chart, quote, and news. The links below still work.",
    };
  }

  const now = opts?.now?.() ?? new Date();
  const fetchImpl = opts?.fetchImpl;
  const win = rangeWindow(range, now);
  const yearWin = rangeWindow("1Y", now);

  const [barsRes, yearRes, snapRes, newsRes] = await Promise.allSettled([
    getStockBars(symbol, win, { fetchImpl }),
    getStockBars(symbol, yearWin, { fetchImpl }),
    getStockSnapshot(symbol, { fetchImpl }),
    getStockNews(symbol, 10, { fetchImpl }),
  ]);

  const rawBars = barsRes.status === "fulfilled" ? barsRes.value : [];
  const series = win.sessionOnly ? latestSessionOnly(rawBars) : rawBars;
  const bars = series.map(barToPoint);

  const yearBars = yearRes.status === "fulfilled" ? yearRes.value : [];
  const week = week52Range(yearBars);
  // Relative volume from the trailing daily series (M2). Null when history is
  // too thin to be meaningful — surfaced as "—", never a fabricated figure.
  const relativeVolume =
    computeRelativeVolume(yearBars.map((b) => b.v))?.ratio ?? null;

  const snap = snapRes.status === "fulfilled" ? snapRes.value : null;
  const quote = snap
    ? mapSnapshotToQuote(symbol, snap, week, relativeVolume)
    : quoteFromDailyBars(symbol, yearBars, week, relativeVolume);

  const news = newsRes.status === "fulfilled" ? mapNews(newsRes.value) : [];

  const available = quote !== null || bars.length > 0;
  const notice = available
    ? null
    : "Alpaca market data is temporarily unavailable — the links below still work.";

  return { symbol, available, range, quote, bars, news, notice };
}
