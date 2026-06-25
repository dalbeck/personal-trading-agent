import "server-only";

import { getAlpacaCalendar, hasAlpacaCredentials } from "@/lib/server/alpaca";
import { MARKET_HOLIDAY_NAMES } from "@/lib/market-holidays";
import {
  computeMarketStatus,
  regularHoursCalendar,
  type CalendarDay,
  type MarketStatus,
} from "@/lib/market-status";

/**
 * Server-side resolver for the header market-status pill. Prefers Alpaca's
 * holiday/half-day-aware calendar; when credentials are absent or the call
 * fails, it falls back to a **clearly labeled** regular-hours approximation so
 * the header always renders. Keys never reach the client — the route returns
 * only resolved boundary timestamps.
 */

/** Resolved status plus `approx`: true when the regular-hours fallback is used. */
export type MarketStatusSnapshot = MarketStatus & { approx: boolean };

const NY_TZ = "America/New_York";
// Cache the raw calendar for a few hours so the header never hammers Alpaca;
// the status itself is recomputed against live `now` on every request.
const CALENDAR_TTL_MS = 6 * 3_600_000;

let calendarCache: { fetchedAt: number; calendar: CalendarDay[] } | null = null;

/** ET calendar date ("YYYY-MM-DD") offset by `deltaDays` from `now`. */
function etDateOffset(now: Date, deltaDays: number): string {
  const shifted = new Date(now.getTime() + deltaDays * 24 * 3_600_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: NY_TZ }).format(shifted);
}

async function loadCalendar(now: Date): Promise<CalendarDay[]> {
  if (calendarCache && now.getTime() - calendarCache.fetchedAt < CALENDAR_TTL_MS) {
    return calendarCache.calendar;
  }
  const calendar = await getAlpacaCalendar(
    etDateOffset(now, -7),
    etDateOffset(now, 7),
  );
  calendarCache = { fetchedAt: now.getTime(), calendar };
  return calendar;
}

/**
 * Resolve the current market-status snapshot. `now` is injectable for tests;
 * defaults to the live clock. Never throws — a failed Alpaca call degrades to
 * the labeled regular-hours fallback.
 */
export async function getMarketStatusSnapshot(
  now: Date = new Date(),
): Promise<MarketStatusSnapshot> {
  if (hasAlpacaCredentials()) {
    try {
      const calendar = await loadCalendar(now);
      const status = computeMarketStatus(now, calendar, {
        holidayNames: MARKET_HOLIDAY_NAMES,
      });
      return { ...status, approx: false };
    } catch {
      // Fall through to the labeled approximation on any fetch/parse failure.
    }
  }

  const status = computeMarketStatus(now, regularHoursCalendar(now));
  return { ...status, approx: true };
}

/** Test-only: drop the in-memory calendar cache. */
export function __resetMarketCache() {
  calendarCache = null;
}
