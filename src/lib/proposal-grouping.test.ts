import { describe, expect, it } from "vitest";
import type { TradeProposal } from "@/lib/types";
import { groupProposalsByDay } from "./proposal-grouping";

function proposal(over: Partial<TradeProposal>): TradeProposal {
  return {
    id: "p",
    createdAt: "2026-06-25T08:30:00-04:00",
    symbol: "GE",
    action: "buy",
    side: "long",
    strategy: "trend",
    qty: 1,
    limitPrice: 100,
    stopPrice: 90,
    takeProfit: 130,
    targetType: "prior_high",
    sector: "Industrials",
    relativeVolume: null,
    catalyst: null,
    catalystType: null,
    catalystSources: [],
    catalystState: null,
    riskPct: 0.01,
    confidence: null,
    convictionScore: null,
    convictionTier: null,
    thesis: "t",
    reasoning: "r",
    status: "pending",
    account: "live",
    advisory: false,
    origin: null,
    redTeam: null,
    lenses: [],
    cashFlow: null,
    dividend: null,
    researchStatus: null,
    pricedAt: null,
    stagedPlan: null,
    reviewByDate: null,
    sample: false,
    ...over,
  };
}

// Reference "now": Fri Jun 26 2026, 10:00 ET.
const NOW = Date.parse("2026-06-26T10:00:00-04:00");

describe("groupProposalsByDay", () => {
  it("labels today and yesterday relative to nowMs", () => {
    const groups = groupProposalsByDay(
      [
        proposal({ id: "a", createdAt: "2026-06-26T09:00:00-04:00" }),
        proposal({ id: "b", createdAt: "2026-06-25T15:00:00-04:00" }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual([
      "Today · Jun 26",
      "Yesterday · Jun 25",
    ]);
  });

  it("uses a bare date for older days", () => {
    const groups = groupProposalsByDay(
      [proposal({ id: "a", createdAt: "2026-06-22T12:00:00-04:00" })],
      NOW,
    );
    expect(groups[0].label).toBe("Jun 22");
  });

  it("buckets by Eastern day, not UTC", () => {
    // 2026-06-26T01:30Z is still Jun 25 in Eastern time (21:30 EDT).
    const groups = groupProposalsByDay(
      [proposal({ id: "late", createdAt: "2026-06-26T01:30:00Z" })],
      NOW,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-06-25");
    expect(groups[0].label).toBe("Yesterday · Jun 25");
  });

  it("sorts days newest-first and proposals newest-first within a day", () => {
    const groups = groupProposalsByDay(
      [
        proposal({ id: "old", createdAt: "2026-06-24T09:00:00-04:00" }),
        proposal({ id: "today-early", createdAt: "2026-06-26T08:00:00-04:00" }),
        proposal({ id: "today-late", createdAt: "2026-06-26T09:30:00-04:00" }),
      ],
      NOW,
    );
    expect(groups.map((g) => g.key)).toEqual([
      "2026-06-26",
      "2026-06-24",
    ]);
    expect(groups[0].items.map((p) => p.id)).toEqual([
      "today-late",
      "today-early",
    ]);
  });

  it("shows the year for days outside the current year", () => {
    const groups = groupProposalsByDay(
      [proposal({ id: "a", createdAt: "2024-12-31T12:00:00-05:00" })],
      NOW,
    );
    expect(groups[0].label).toBe("Dec 31, 2024");
  });

  it("returns no groups for an empty list", () => {
    expect(groupProposalsByDay([], NOW)).toEqual([]);
  });
});
