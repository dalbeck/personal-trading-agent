import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW_MODE,
  MODE_LABEL,
  VIEW_MODES,
  VIEW_MODE_COOKIE,
  otherMode,
  parseViewMode,
} from "./mode";

describe("view mode", () => {
  it("defaults to paper — the proving ground is the safe default", () => {
    expect(DEFAULT_VIEW_MODE).toBe("paper");
  });

  it("exposes exactly the two book modes", () => {
    expect(VIEW_MODES).toEqual(["paper", "live"]);
  });

  describe("parseViewMode", () => {
    it("accepts the live cookie value", () => {
      expect(parseViewMode("live")).toBe("live");
    });

    it("accepts the paper cookie value", () => {
      expect(parseViewMode("paper")).toBe("paper");
    });

    it.each([undefined, null, "", "garbage", "LIVE", "Paper", "1"])(
      "falls back to the default for unrecognized value %p",
      (value) => {
        expect(parseViewMode(value as string | null | undefined)).toBe("paper");
      },
    );
  });

  describe("otherMode", () => {
    it("returns the inactive book — used for the 'also running' indicator", () => {
      expect(otherMode("paper")).toBe("live");
      expect(otherMode("live")).toBe("paper");
    });
  });

  it("labels each mode for display", () => {
    expect(MODE_LABEL.paper).toBe("Paper");
    expect(MODE_LABEL.live).toBe("Live");
  });

  it("names the persistence cookie", () => {
    expect(VIEW_MODE_COOKIE).toBe("view-mode");
  });
});
