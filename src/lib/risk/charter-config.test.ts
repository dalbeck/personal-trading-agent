import { describe, expect, it } from "vitest";
import { RISK_LIMITS } from "@strategy/charter.config";

/**
 * Guards that the machine-readable config stays in lockstep with the numbers
 * written in `strategy/charter.md`. If you change a rail in the charter, change
 * it here too — this test is the tripwire.
 */
describe("RISK_LIMITS mirrors strategy/charter.md", () => {
  it("matches the charter's hard rails", () => {
    expect(RISK_LIMITS).toEqual({
      perPositionRiskPct: 0.02, // ≤ 2% risk to stop
      perPositionSizePct: 0.2, // ≤ 20% of equity per name
      maxConcurrentPositions: 5,
      maxOrdersPerDay: 6,
      drawdownHaltPct: 0.1, // −10% from high-water
      emergencySpyDropPct: 0.02, // SPY −2% intraday
      emergencyVixLevel: 30, // VIX > 30
      allowedOrderTypes: ["marketable_limit"],
      allowedAssetClasses: ["equity"],
      excludedSymbols: ["SPY"],
    });
  });
});
