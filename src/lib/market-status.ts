/**
 * Pure market-status + countdown logic. No I/O and no `server-only` import, so
 * it is safe to import from both the API route (server) and the header pill
 * (client), and fully unit-testable with a fixed `now` + calendar.
 *
 * The source of truth is Alpaca's `/v2/calendar`: each entry is a real trading
 * session with ET wall-clock open/close ("09:30"/"16:00", or an early "13:00"
 * on a half day). Every instant is resolved in **America/New_York** via `Intl`,
 * so status and countdowns are correct regardless of the host machine's clock.
 */

const NY_TZ = "America/New_York";

/** One Alpaca calendar session: ET date + ET wall-clock open/close. */
export interface CalendarDay {
  /** ET calendar date, "YYYY-MM-DD". */
  date: string;
  /** ET wall-clock open, "HH:MM" (24h). */
  open: string;
  /** ET wall-clock close, "HH:MM" (24h). */
  close: string;
}

/** Resolved market status + the boundary instants the client counts down to. */
export interface MarketStatus {
  isOpen: boolean;
  /** ISO instant of the next regular-session open (null if none in window). */
  nextOpen: string | null;
  /** ISO instant of the next regular-session close (null if none in window). */
  nextClose: string | null;
  /** ISO open of the relevant session (current if open, else the next one). */
  sessionOpen: string | null;
  /** ISO close of the session currently open; null when closed. */
  sessionClose: string | null;
  /** Whether the relevant session closes early (before 16:00 ET). */
  isHalfDay: boolean;
  /** Cosmetic holiday label when closed on a weekday with no session. */
  holidayName: string | null;
}

/**
 * The offset (ms) to subtract from a UTC instant to express it as NY local
 * wall-clock — i.e. `nyOffsetMs` = (NY local) − (UTC), evaluated at `utcMs`.
 */
function nyOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));

  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  // Some engines render midnight as hour 24; normalize to 0.
  const hour = map.hour === 24 ? 0 : map.hour;
  const asLocalUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    hour,
    map.minute,
    map.second,
  );
  return asLocalUTC - utcMs;
}

/**
 * Convert an ET wall-clock date+time ("YYYY-MM-DD", "HH:MM") to an absolute
 * instant. Market hours (09:30–16:00) are never near the 2 AM DST transition,
 * so resolving the zone offset once at the naive guess is exact here.
 */
export function etDateTimeToInstant(date: string, time: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const naiveUTC = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(naiveUTC - nyOffsetMs(naiveUTC));
}

/** A session is a half day when its close is earlier than 16:00 ET. */
function isEarlyClose(close: string): boolean {
  const [h, m] = close.split(":").map(Number);
  return h * 60 + m < 16 * 60;
}

/** ET calendar date ("YYYY-MM-DD") for an instant. */
function etDateString(when: Date): string {
  // en-CA renders ISO-style YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: NY_TZ }).format(when);
}

/** Short ET weekday ("Mon") for an instant. */
function etWeekdayShort(when: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    weekday: "short",
  }).format(when);
}

interface Session {
  date: string;
  open: Date;
  close: Date;
  isHalfDay: boolean;
}

function toSessions(calendar: CalendarDay[]): Session[] {
  return calendar
    .map((d) => ({
      date: d.date,
      open: etDateTimeToInstant(d.date, d.open),
      close: etDateTimeToInstant(d.date, d.close),
      isHalfDay: isEarlyClose(d.close),
    }))
    .filter((s) => s.close.getTime() > s.open.getTime())
    .sort((a, b) => a.open.getTime() - b.open.getTime());
}

/**
 * Resolve open/closed status and the next boundary from a calendar and a fixed
 * `now`. Pure: given the same inputs it always returns the same result.
 */
export function computeMarketStatus(
  now: Date,
  calendar: CalendarDay[],
  opts?: { holidayNames?: Record<string, string> },
): MarketStatus {
  const nowMs = now.getTime();
  const sessions = toSessions(calendar);

  const current = sessions.find(
    (s) => nowMs >= s.open.getTime() && nowMs < s.close.getTime(),
  );
  const next = sessions.find((s) => s.open.getTime() > nowMs);

  if (current) {
    return {
      isOpen: true,
      nextOpen: next ? next.open.toISOString() : null,
      nextClose: current.close.toISOString(),
      sessionOpen: current.open.toISOString(),
      sessionClose: current.close.toISOString(),
      isHalfDay: current.isHalfDay,
      holidayName: null,
    };
  }

  return {
    isOpen: false,
    nextOpen: next ? next.open.toISOString() : null,
    nextClose: next ? next.close.toISOString() : null,
    sessionOpen: next ? next.open.toISOString() : null,
    sessionClose: null,
    isHalfDay: next ? next.isHalfDay : false,
    holidayName: resolveHolidayName(now, sessions, opts?.holidayNames),
  };
}

/**
 * A holiday label is only meaningful when the market is closed on a *weekday*
 * that has no trading session at all. Weekends aren't holidays, and a weekday
 * that simply hasn't opened yet / has already closed still has a session.
 */
function resolveHolidayName(
  now: Date,
  sessions: Session[],
  names?: Record<string, string>,
): string | null {
  const weekday = etWeekdayShort(now);
  if (weekday === "Sat" || weekday === "Sun") return null;

  const today = etDateString(now);
  if (sessions.some((s) => s.date === today)) return null;

  return names?.[today] ?? "market holiday";
}

/** Compact countdown, minute granularity, never negative: "2h 14m", "3d 4h". */
export function formatCountdown(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/** Screen-reader countdown: "2 hours 14 minutes", "1 day 3 hours". */
export function formatCountdownVerbose(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (days) parts.push(unit(days, "day"));
  if (hours) parts.push(unit(hours, "hour"));
  if (mins || parts.length === 0) parts.push(unit(mins, "minute"));
  return parts.join(" ");
}

/** Format an instant as an ET wall-clock time, e.g. "4:00 PM". */
export function formatEtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** Short ET weekday for an instant, e.g. "Mon". */
export function formatEtWeekday(iso: string): string {
  return etWeekdayShort(new Date(iso));
}

/** Whether two instants fall on the same ET calendar day. */
export function sameEtDay(a: string | Date, b: string | Date): boolean {
  return etDateString(new Date(a)) === etDateString(new Date(b));
}

/**
 * Synthetic regular-hours calendar (Mon–Fri 09:30–16:00 ET) spanning roughly
 * [now − 1 day, now + 8 days]. This is the **labeled fallback** used only when
 * Alpaca credentials are absent — it is NOT holiday- or half-day-aware and must
 * never be presented as if it were.
 */
export function regularHoursCalendar(now: Date, days = 10): CalendarDay[] {
  const dayMs = 24 * 3_600_000;
  const start = now.getTime() - dayMs;
  const seen = new Set<string>();
  const out: CalendarDay[] = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(start + i * dayMs);
    const date = etDateString(d);
    if (seen.has(date)) continue; // guard against DST-induced duplicates
    seen.add(date);
    const weekday = etWeekdayShort(d);
    if (weekday === "Sat" || weekday === "Sun") continue;
    out.push({ date, open: "09:30", close: "16:00" });
  }
  return out;
}
