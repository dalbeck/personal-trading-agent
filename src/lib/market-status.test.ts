import { describe, expect, it } from "vitest";
import {
  computeMarketStatus,
  etDateTimeToInstant,
  formatCountdown,
  formatCountdownVerbose,
  regularHoursCalendar,
  type CalendarDay,
} from "@/lib/market-status";

// A normal trading week in June 2025 (EDT, UTC−4). Thursday the 19th is
// deliberately omitted — that's Juneteenth, a market holiday.
const JUNE_WEEK: CalendarDay[] = [
  { date: "2025-06-16", open: "09:30", close: "16:00" }, // Mon
  { date: "2025-06-17", open: "09:30", close: "16:00" }, // Tue
  { date: "2025-06-18", open: "09:30", close: "16:00" }, // Wed
  { date: "2025-06-20", open: "09:30", close: "16:00" }, // Fri
  { date: "2025-06-23", open: "09:30", close: "16:00" }, // Mon (next week)
];

describe("etDateTimeToInstant — ET wall-clock to absolute UTC instant", () => {
  it("resolves a summer (EDT, −4) open to the right UTC instant", () => {
    // 09:30 ET in June = 13:30 UTC.
    expect(etDateTimeToInstant("2025-06-17", "09:30").toISOString()).toBe(
      "2025-06-17T13:30:00.000Z",
    );
  });

  it("resolves a winter (EST, −5) open to the right UTC instant", () => {
    // 09:30 ET in January = 14:30 UTC. Proves DST is handled per-date, not
    // assumed from the host machine's clock.
    expect(etDateTimeToInstant("2025-01-15", "09:30").toISOString()).toBe(
      "2025-01-15T14:30:00.000Z",
    );
  });
});

describe("computeMarketStatus", () => {
  it("OPEN: mid-session reports open, today's close, and the next open", () => {
    // 14:00 ET Tuesday.
    const now = new Date("2025-06-17T18:00:00Z");
    const s = computeMarketStatus(now, JUNE_WEEK);
    expect(s.isOpen).toBe(true);
    expect(s.nextClose).toBe("2025-06-17T20:00:00.000Z"); // 16:00 ET today
    expect(s.sessionClose).toBe("2025-06-17T20:00:00.000Z");
    expect(s.nextOpen).toBe("2025-06-18T13:30:00.000Z"); // 09:30 ET Wed
    expect(s.isHalfDay).toBe(false);
    expect(s.holidayName).toBeNull();
  });

  it("AFTER-HOURS: past today's close reports closed and tomorrow's open", () => {
    // 17:00 ET Tuesday, after the 16:00 close.
    const now = new Date("2025-06-17T21:00:00Z");
    const s = computeMarketStatus(now, JUNE_WEEK);
    expect(s.isOpen).toBe(false);
    expect(s.nextOpen).toBe("2025-06-18T13:30:00.000Z"); // 09:30 ET Wed
    expect(s.nextClose).toBe("2025-06-18T20:00:00.000Z");
    expect(s.sessionClose).toBeNull();
    expect(s.holidayName).toBeNull();
  });

  it("WEEKEND: Saturday reports closed with Monday's open and no holiday name", () => {
    // 14:00 ET Saturday.
    const now = new Date("2025-06-21T18:00:00Z");
    const s = computeMarketStatus(now, JUNE_WEEK, {
      holidayNames: { "2025-06-21": "should-not-be-used" },
    });
    expect(s.isOpen).toBe(false);
    expect(s.nextOpen).toBe("2025-06-23T13:30:00.000Z"); // 09:30 ET Mon
    expect(s.holidayName).toBeNull(); // a weekend is not a holiday
  });

  it("HOLIDAY: a weekday with no session reports closed with a holiday name", () => {
    // 13:00 ET Thursday — Juneteenth, which JUNE_WEEK omits.
    const now = new Date("2025-06-19T17:00:00Z");
    const s = computeMarketStatus(now, JUNE_WEEK, {
      holidayNames: { "2025-06-19": "Juneteenth" },
    });
    expect(s.isOpen).toBe(false);
    expect(s.nextOpen).toBe("2025-06-20T13:30:00.000Z"); // 09:30 ET Fri
    expect(s.holidayName).toBe("Juneteenth");
  });

  it("HOLIDAY: unknown weekday closure falls back to a generic label", () => {
    const now = new Date("2025-06-19T17:00:00Z");
    const s = computeMarketStatus(now, JUNE_WEEK); // no name map
    expect(s.isOpen).toBe(false);
    expect(s.holidayName).toBe("market holiday");
  });

  it("HALF-DAY: mid early-close session reports the real 1:00 PM close", () => {
    const halfDayWeek: CalendarDay[] = [
      { date: "2025-06-18", open: "09:30", close: "13:00" }, // early close
      { date: "2025-06-20", open: "09:30", close: "16:00" },
    ];
    // 12:00 ET Wednesday, before the 13:00 early close.
    const now = new Date("2025-06-18T16:00:00Z");
    const s = computeMarketStatus(now, halfDayWeek);
    expect(s.isOpen).toBe(true);
    expect(s.sessionClose).toBe("2025-06-18T17:00:00.000Z"); // 13:00 ET
    expect(s.isHalfDay).toBe(true);
  });

  it("HALF-DAY: after the early close reports closed", () => {
    const halfDayWeek: CalendarDay[] = [
      { date: "2025-06-18", open: "09:30", close: "13:00" },
      { date: "2025-06-20", open: "09:30", close: "16:00" },
    ];
    // 14:00 ET Wednesday, after the 13:00 early close.
    const now = new Date("2025-06-18T18:00:00Z");
    const s = computeMarketStatus(now, halfDayWeek);
    expect(s.isOpen).toBe(false);
    expect(s.nextOpen).toBe("2025-06-20T13:30:00.000Z");
  });
});

describe("formatCountdown", () => {
  it("formats hours and minutes", () => {
    expect(formatCountdown(2 * 3600_000 + 14 * 60_000)).toBe("2h 14m");
  });
  it("formats minutes only under an hour", () => {
    expect(formatCountdown(42 * 60_000)).toBe("42m");
  });
  it("collapses long horizons to days and hours", () => {
    expect(formatCountdown(63 * 3600_000)).toBe("2d 15h");
  });
  it("never goes negative", () => {
    expect(formatCountdown(-5000)).toBe("0m");
  });
  it("verbose form is screen-reader friendly", () => {
    expect(formatCountdownVerbose(2 * 3600_000 + 14 * 60_000)).toBe(
      "2 hours 14 minutes",
    );
    expect(formatCountdownVerbose(1 * 3600_000 + 1 * 60_000)).toBe(
      "1 hour 1 minute",
    );
  });
});

describe("regularHoursCalendar — labeled fallback", () => {
  it("emits Mon–Fri 09:30–16:00 sessions and excludes weekends", () => {
    const now = new Date("2025-06-17T18:00:00Z"); // Tuesday
    const cal = regularHoursCalendar(now);
    expect(cal.length).toBeGreaterThan(0);
    expect(cal.every((d) => d.open === "09:30" && d.close === "16:00")).toBe(
      true,
    );
    // No Saturday (2025-06-21) or Sunday (2025-06-22) in the window.
    expect(cal.some((d) => d.date === "2025-06-21")).toBe(false);
    expect(cal.some((d) => d.date === "2025-06-22")).toBe(false);
    // Computes a sane open/closed status with no holiday awareness.
    const s = computeMarketStatus(now, cal);
    expect(s.isOpen).toBe(true);
  });
});
