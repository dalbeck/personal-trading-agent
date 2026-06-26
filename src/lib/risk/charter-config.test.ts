import { describe, expect, it } from "vitest";
import {
  DISCOVERY_LIMITS,
  LIVE_LIMITS,
  RISK_LIMITS,
} from "@strategy/charter.config";

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
      maxSectorWeightPct: 0.4, // ≤ 40% of equity per sector
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

describe("LIVE_LIMITS mirrors strategy/charter.md (Phase 3 live pilot caps)", () => {
  it("matches the charter's live-pilot guardrails", () => {
    expect(LIVE_LIMITS).toEqual({
      weeklyFundingCapUsd: 100, // ≤ $100 human deposits / rolling 7 days
      maxAccountExposureUsd: 500, // hard total live exposure ceiling
      drawdownKillPct: 0.1, // −10% from the live high-water mark
    });
  });
});

describe("DISCOVERY_LIMITS mirrors strategy/charter.md (Phase 3 discovery caps)", () => {
  it("matches the charter's discovery bounds", () => {
    expect(DISCOVERY_LIMITS).toEqual({
      ideaCap: 20, // DISCOVERY_IDEA_CAP — generous review-funnel default
      maxIdeaCap: 40, // hard ceiling the tunable idea cap may reach
      maxProposalsPerSector: 3, // best-in-sector cap per run
      minSectorsTarget: 3, // sector-spread target
      maxWatchlistSymbols: 20, // bounds auto-added discovery candidates
    });
  });

  it("decouples the idea cap from the hard daily ORDER cap (review ≠ order)", () => {
    // The funnel is a preference, larger than the order rail; the order cap is
    // the hard rail and is unchanged. They must not coincide by accident — that
    // would re-couple the review queue to the execution limit.
    expect(DISCOVERY_LIMITS.ideaCap).toBeGreaterThan(
      RISK_LIMITS.maxOrdersPerDay,
    );
    expect(DISCOVERY_LIMITS.maxIdeaCap).toBeGreaterThanOrEqual(
      DISCOVERY_LIMITS.ideaCap,
    );
  });
});
