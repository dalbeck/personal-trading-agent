/**
 * Cosmetic ET-date → holiday-name map for the US equity market. Alpaca's
 * calendar is authoritative for *whether* the market is closed (it simply omits
 * the session); this map only supplies a friendly **label**. An unknown closure
 * falls back to "market holiday" — so a stale map degrades gracefully and never
 * affects the open/closed logic itself.
 */
export const MARKET_HOLIDAY_NAMES: Record<string, string> = {
  // 2025
  "2025-01-01": "New Year's Day",
  "2025-01-20": "Martin Luther King Jr. Day",
  "2025-02-17": "Presidents' Day",
  "2025-04-18": "Good Friday",
  "2025-05-26": "Memorial Day",
  "2025-06-19": "Juneteenth",
  "2025-07-04": "Independence Day",
  "2025-09-01": "Labor Day",
  "2025-11-27": "Thanksgiving",
  "2025-12-25": "Christmas",
  // 2026
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Presidents' Day",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving",
  "2026-12-25": "Christmas",
};
