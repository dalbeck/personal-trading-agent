import { describe, expect, it } from "vitest";
import {
  STRATEGIES,
  STRATEGY_LABEL,
  isValueStrategy,
  strategyLabel,
} from "./strategy";

describe("strategy helpers", () => {
  it("lists both mandates, trend first", () => {
    expect(STRATEGIES).toEqual(["trend", "value"]);
  });

  it("labels each mandate", () => {
    expect(STRATEGY_LABEL.trend).toBe("Trend");
    expect(STRATEGY_LABEL.value).toBe("Value");
  });

  it("identifies the value mandate (and treats null/undefined as not-value)", () => {
    expect(isValueStrategy("value")).toBe(true);
    expect(isValueStrategy("trend")).toBe(false);
    expect(isValueStrategy(null)).toBe(false);
    expect(isValueStrategy(undefined)).toBe(false);
  });

  it("defaults a missing strategy to the trend label", () => {
    expect(strategyLabel(null)).toBe("Trend");
    expect(strategyLabel("value")).toBe("Value");
  });
});
