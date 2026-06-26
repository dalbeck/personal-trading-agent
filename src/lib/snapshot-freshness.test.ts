import { describe, expect, it } from "vitest";
import {
  SNAPSHOT_STALE_AFTER_MINUTES,
  snapshotFreshness,
} from "./snapshot-freshness";

describe("snapshotFreshness", () => {
  const now = new Date("2026-06-25T12:30:00-04:00");

  it("reports a recent snapshot as fresh, with its age in minutes", () => {
    const f = snapshotFreshness("2026-06-25T12:25:00-04:00", now);
    expect(f.ageMinutes).toBe(5);
    expect(f.stale).toBe(false);
  });

  it("flags a snapshot older than the stale threshold as stale", () => {
    // 7 hours old, past the default 6h threshold.
    const f = snapshotFreshness("2026-06-25T05:30:00-04:00", now);
    expect(f.ageMinutes).toBe(7 * 60);
    expect(f.stale).toBe(true);
  });

  it("treats exactly the threshold as stale", () => {
    const asOf = new Date(now.getTime() - SNAPSHOT_STALE_AFTER_MINUTES * 60_000);
    const f = snapshotFreshness(asOf.toISOString(), now);
    expect(f.stale).toBe(true);
  });

  it("honours a custom stale threshold", () => {
    const f = snapshotFreshness("2026-06-25T12:00:00-04:00", now, 20);
    expect(f.ageMinutes).toBe(30);
    expect(f.stale).toBe(true);
  });

  it("returns null age and not-stale when there is no snapshot", () => {
    expect(snapshotFreshness(null, now)).toEqual({ ageMinutes: null, stale: false });
    expect(snapshotFreshness(undefined, now)).toEqual({
      ageMinutes: null,
      stale: false,
    });
  });

  it("returns null age and not-stale for an unparseable timestamp", () => {
    expect(snapshotFreshness("not-a-date", now)).toEqual({
      ageMinutes: null,
      stale: false,
    });
  });

  it("clamps clock skew (a future snapshot) to zero age, not stale", () => {
    const f = snapshotFreshness("2026-06-25T12:45:00-04:00", now);
    expect(f.ageMinutes).toBe(0);
    expect(f.stale).toBe(false);
  });
});
