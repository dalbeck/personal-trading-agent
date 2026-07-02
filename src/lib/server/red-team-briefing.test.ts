import { describe, expect, it } from "vitest";
import type { TradeProposal } from "@/lib/types";
import {
  isVerdictFresh,
  redTeamVerdictHash,
  toRedTeamProposal,
} from "./red-team-briefing";

/** A fully-populated proposal — every briefing-relevant field is set, so a
 *  dropped field in the mapper surfaces as a null/undefined in the output. */
function proposal(over: Partial<TradeProposal> = {}): TradeProposal {
  return {
    id: "p",
    createdAt: "2026-06-25T08:30:00-04:00",
    symbol: "KO",
    action: "buy",
    side: "long",
    strategy: "value",
    sleeve: "swing-value",
    qty: 3,
    limitPrice: 60,
    stopPrice: null,
    takeProfit: 80,
    targetType: "fundamental",
    sector: "Consumer Staples",
    relativeVolume: 1.2,
    catalyst: "Dividend aristocrat at a multi-year low",
    catalystType: "other",
    catalystSources: [
      {
        headline: "KO dips",
        publisher: "WSJ",
        url: "https://x",
        publishedAt: "2026-06-24",
      },
    ],
    catalystState: "found",
    riskPct: 0.01,
    targetWeightPct: 0.05,
    reviewTriggerPct: 0.2,
    confidence: null,
    convictionScore: null,
    convictionTier: null,
    thesis: "Durable staple, covered dividend, trades at a discount.",
    reasoning: "Mean reversion with a real floor.",
    status: "pending",
    account: "live",
    advisory: false,
    origin: null,
    redTeam: null,
    lenses: [],
    cashFlow: {
      operatingCashFlow: 12_000,
      freeCashFlow: 9_000,
      fcfTrend: "growing",
      fcfYield: 0.06,
      netDebt: 5_000,
      debtToEquity: 0.4,
      interestCoverage: 12,
    },
    dividend: {
      dividendYield: 0.03,
      payoutRatio: 0.5,
      fcfPayout: 0.4,
      fcfCoverage: 2.2,
      growthStreakYears: 60,
      dividendCagr: 0.05,
    },
    researchStatus: "ok",
    researchStatusReason: null,
    cashFlowSource: null,
    dividendSource: null,
    pricedAt: null,
    researchAt: null,
    stagedPlan: null,
    reviewByDate: null,
    sample: false,
    ...over,
  };
}

describe("toRedTeamProposal", () => {
  it("carries every briefing field for a value proposal (no silent drops)", () => {
    const rt = toRedTeamProposal(proposal());
    expect(rt.strategy).toBe("value");
    expect(rt.sleeve).toBe("swing-value");
    expect(rt.targetWeightPct).toBe(0.05);
    expect(rt.reviewTriggerPct).toBe(0.2);
    expect(rt.targetType).toBe("fundamental");
    expect(rt.relativeVolume).toBe(1.2);
    expect(rt.catalyst).toMatch(/Dividend aristocrat/);
    expect(rt.catalystType).toBe("other");
    expect(rt.sector).toBe("Consumer Staples");
    expect(rt.catalystSources).toHaveLength(1);
    expect(rt.catalystState).toBe("found");
    // Value-lens briefing fields — present for a value proposal.
    expect(rt.cashFlow).not.toBeNull();
    expect(rt.dividend).not.toBeNull();
    expect(rt.researchStatus).toBe("ok");
  });

  it("nulls the value-only fields for a trend proposal (never merges lenses)", () => {
    const rt = toRedTeamProposal(
      proposal({ strategy: "trend", sleeve: "swing-trend", stopPrice: 55 }),
    );
    expect(rt.strategy).toBe("trend");
    expect(rt.sleeve).toBe("swing-trend");
    // Value-only briefing must NOT bleed into the trend lens.
    expect(rt.cashFlow).toBeNull();
    expect(rt.dividend).toBeNull();
    expect(rt.researchStatus).toBeNull();
    // Non-value fields still carried.
    expect(rt.stopPrice).toBe(55);
    expect(rt.sector).toBe("Consumer Staples");
  });

  it("derives the value lens from the sleeve even when strategy says trend", () => {
    // sleeve takes precedence over strategy (matches buildProsecutorPrompt).
    const rt = toRedTeamProposal(proposal({ strategy: "trend", sleeve: "swing-value" }));
    expect(rt.cashFlow).not.toBeNull();
  });

  // The value briefing is gated by the SAME rule buildProsecutorPrompt uses
  // (sleeve wins over strategy). Locking every sleeve down guards against the
  // two lenses drifting apart.
  it.each([
    ["swing-trend", false],
    ["swing-value", true],
    ["position-mid", false],
    ["core-long", true],
  ] as const)("briefs value fields for sleeve %s → %s", (sleeve, briefed) => {
    const rt = toRedTeamProposal(proposal({ sleeve, strategy: undefined }));
    if (briefed) {
      expect(rt.cashFlow).not.toBeNull();
      expect(rt.dividend).not.toBeNull();
    } else {
      expect(rt.cashFlow).toBeNull();
      expect(rt.dividend).toBeNull();
    }
  });
});

describe("redTeamVerdictHash", () => {
  it("is stable for an identical briefing", () => {
    const a = redTeamVerdictHash(toRedTeamProposal(proposal()));
    const b = redTeamVerdictHash(toRedTeamProposal(proposal()));
    expect(a).toBe(b);
  });

  it("changes when a core judged field changes (levels / qty / thesis)", () => {
    const base = redTeamVerdictHash(toRedTeamProposal(proposal()));
    expect(redTeamVerdictHash(toRedTeamProposal(proposal({ limitPrice: 61 })))).not.toBe(base);
    expect(redTeamVerdictHash(toRedTeamProposal(proposal({ takeProfit: 90 })))).not.toBe(base);
    expect(redTeamVerdictHash(toRedTeamProposal(proposal({ qty: 5 })))).not.toBe(base);
    expect(redTeamVerdictHash(toRedTeamProposal(proposal({ thesis: "Different." })))).not.toBe(base);
  });

  it("is stable across mapper-only fields (sleeve/targetWeightPct) — no false staleness", () => {
    // These fields are omitted by the analyze-time mapper, so hashing them would
    // make an unchanged proposal re-run on every approval. They must NOT move the
    // hash.
    const base = redTeamVerdictHash(toRedTeamProposal(proposal()));
    expect(redTeamVerdictHash(toRedTeamProposal(proposal({ targetWeightPct: 0.09 })))).toBe(base);
  });
});

describe("isVerdictFresh", () => {
  const NOW = "2026-06-25T12:00:00-04:00";
  const briefing = () => toRedTeamProposal(proposal());
  const verdict = (over: Record<string, unknown> = {}) => ({
    verdict: "approve" as const,
    notes: "ok",
    factors: [],
    basis: null,
    model: null,
    judgedAt: NOW,
    judgedHash: redTeamVerdictHash(briefing()),
    ...over,
  });

  it("is fresh when the hash matches and it is within the TTL", () => {
    expect(isVerdictFresh(verdict(), briefing(), { now: NOW })).toBe(true);
  });

  it("is stale when the briefing hash no longer matches", () => {
    const changed = toRedTeamProposal(proposal({ limitPrice: 61 }));
    expect(isVerdictFresh(verdict(), changed, { now: NOW })).toBe(false);
  });

  it("is stale once older than the TTL", () => {
    const later = "2026-06-27T12:00:00-04:00"; // 48h later, past the 24h TTL
    expect(isVerdictFresh(verdict(), briefing(), { now: later })).toBe(false);
  });

  it("is stale when the stamp is missing (older record)", () => {
    expect(
      isVerdictFresh(verdict({ judgedAt: null, judgedHash: null }), briefing(), {
        now: NOW,
      }),
    ).toBe(false);
  });

  it("uses the charter TTL constant (pinned at 24h)", async () => {
    const { RED_TEAM_VERDICT_TTL_HOURS } = await import("@/lib/red-team-model");
    expect(RED_TEAM_VERDICT_TTL_HOURS).toBe(24);
    // A verdict exactly at the TTL boundary is still fresh; just past it is stale.
    const judgedAt = "2026-06-24T12:00:00-04:00";
    const atBoundary = "2026-06-25T12:00:00-04:00"; // +24h
    const pastBoundary = "2026-06-25T12:00:01-04:00"; // +24h1s
    expect(isVerdictFresh(verdict({ judgedAt }), briefing(), { now: atBoundary })).toBe(true);
    expect(isVerdictFresh(verdict({ judgedAt }), briefing(), { now: pastBoundary })).toBe(false);
  });
});
