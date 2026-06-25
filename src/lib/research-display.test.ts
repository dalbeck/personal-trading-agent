import { describe, expect, it } from "vitest";
import {
  isResearchStale,
  RESEARCH_STALE_AGE_MS,
  researchAgeLabel,
} from "./research-display";

const NOW = Date.parse("2026-06-25T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("researchAgeLabel", () => {
  it("formats minutes / hours / days ago", () => {
    expect(researchAgeLabel(ago(30_000), NOW)).toBe("just now");
    expect(researchAgeLabel(ago(5 * MIN), NOW)).toBe("5m ago");
    expect(researchAgeLabel(ago(3 * HOUR), NOW)).toBe("3h ago");
    expect(researchAgeLabel(ago(2 * DAY), NOW)).toBe("2d ago");
  });

  it("returns null for absent or future/invalid timestamps", () => {
    expect(researchAgeLabel(null, NOW)).toBeNull();
    expect(researchAgeLabel("not-a-date", NOW)).toBeNull();
    expect(researchAgeLabel(ago(-MIN), NOW)).toBeNull(); // future
  });
});

describe("isResearchStale", () => {
  it("flags entries at/past the stale threshold, not fresher ones", () => {
    expect(isResearchStale(ago(RESEARCH_STALE_AGE_MS + MIN), NOW)).toBe(true);
    expect(isResearchStale(ago(RESEARCH_STALE_AGE_MS - MIN), NOW)).toBe(false);
    expect(isResearchStale(null, NOW)).toBe(false);
  });
});
