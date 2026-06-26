import { describe, expect, it } from "vitest";
import {
  CONVICTION_TIERS,
  compareByConviction,
  convictionTierFromScore,
} from "./conviction";
import type { TradeProposal } from "@/lib/types";

describe("convictionTierFromScore", () => {
  it("buckets a composite score into high / moderate / watch", () => {
    // Thresholds mirror the confidence buckets: high ≥ 0.7, moderate ≥ 0.4.
    expect(convictionTierFromScore(0.92)).toBe("high");
    expect(convictionTierFromScore(0.7)).toBe("high");
    expect(convictionTierFromScore(0.55)).toBe("moderate");
    expect(convictionTierFromScore(0.4)).toBe("moderate");
    expect(convictionTierFromScore(0.2)).toBe("watch");
    expect(convictionTierFromScore(0)).toBe("watch");
  });

  it("clamps out-of-range / non-finite scores", () => {
    expect(convictionTierFromScore(1.5)).toBe("high");
    expect(convictionTierFromScore(-1)).toBe("watch");
    expect(convictionTierFromScore(Number.NaN)).toBe("watch");
  });
});

describe("CONVICTION_TIERS", () => {
  it("is ordered strongest-first", () => {
    expect(CONVICTION_TIERS).toEqual(["high", "moderate", "watch"]);
  });
});

describe("compareByConviction", () => {
  const p = (over: Partial<TradeProposal>): TradeProposal =>
    ({
      id: over.id ?? "x",
      createdAt: "2026-06-26T08:30:00-04:00",
      symbol: "X",
      action: "buy",
      side: "long",
      qty: 1,
      limitPrice: 10,
      stopPrice: null,
      takeProfit: null,
      targetType: null,
      sector: null,
      relativeVolume: null,
      catalyst: null,
      catalystType: null,
      riskPct: 0.01,
      confidence: null,
      convictionScore: null,
      convictionTier: null,
      thesis: "t",
      reasoning: "r",
      status: "pending",
      account: "paper",
      advisory: false,
      redTeam: null,
      reviewByDate: null,
      sample: false,
      ...over,
    }) as TradeProposal;

  it("sorts high tier before moderate before watch", () => {
    const items = [
      p({ id: "w", convictionTier: "watch" }),
      p({ id: "h", convictionTier: "high" }),
      p({ id: "m", convictionTier: "moderate" }),
    ];
    const ids = [...items].sort(compareByConviction).map((x) => x.id);
    expect(ids).toEqual(["h", "m", "w"]);
  });

  it("breaks ties within a tier by convictionScore (higher first)", () => {
    const items = [
      p({ id: "lo", convictionTier: "high", convictionScore: 0.72 }),
      p({ id: "hi", convictionTier: "high", convictionScore: 0.95 }),
    ];
    const ids = [...items].sort(compareByConviction).map((x) => x.id);
    expect(ids).toEqual(["hi", "lo"]);
  });

  it("treats a missing tier as the weakest (sorts last), never hidden", () => {
    const items = [
      p({ id: "none", convictionTier: null }),
      p({ id: "watch", convictionTier: "watch" }),
      p({ id: "high", convictionTier: "high" }),
    ];
    const ids = [...items].sort(compareByConviction).map((x) => x.id);
    expect(ids).toEqual(["high", "watch", "none"]);
  });

  it("falls back to newest-first when tier and score are equal", () => {
    const items = [
      p({
        id: "older",
        convictionTier: "moderate",
        createdAt: "2026-06-26T08:00:00-04:00",
      }),
      p({
        id: "newer",
        convictionTier: "moderate",
        createdAt: "2026-06-26T09:00:00-04:00",
      }),
    ];
    const ids = [...items].sort(compareByConviction).map((x) => x.id);
    expect(ids).toEqual(["newer", "older"]);
  });
});
