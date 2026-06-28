import { describe, expect, it, vi } from "vitest";
import type { RedTeamVerdict, TradeProposal } from "@/lib/types";
import { sweepPendingRedTeam } from "./red-team-sweep";

const setVerdictMock = () =>
  vi.fn(
    async (_id: string, _v: RedTeamVerdict, _o?: { dataDir?: string }) => ({
      id: "x",
      file: "f",
    }),
  );

function proposal(over: Partial<TradeProposal>): TradeProposal {
  return {
    id: "p",
    createdAt: "2026-06-25T08:30:00-04:00",
    symbol: "GE",
    action: "buy",
    side: "long",
    strategy: "trend",
    qty: 0.05,
    limitPrice: 374.5,
    stopPrice: 355,
    takeProfit: 420,
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

describe("sweepPendingRedTeam", () => {
  it("judges only proposals without a verdict and writes the result", async () => {
    const setVerdict = setVerdictMock();
    const exec = vi.fn(async () => '{"verdict":"concern","notes":"Chasing highs."}');
    const res = await sweepPendingRedTeam({
      proposals: [
        proposal({ id: "a", redTeam: null }),
        proposal({ id: "b", redTeam: { verdict: "approve", notes: "ok", factors: [], basis: null } }),
      ],
      exec,
      setVerdict,
    });
    expect(res).toEqual({ considered: 1, swept: 1 });
    expect(exec).toHaveBeenCalledTimes(1); // only the verdict-less one
    expect(setVerdict).toHaveBeenCalledWith(
      "a",
      { verdict: "concern", notes: "Chasing highs.", factors: [], basis: null },
      expect.anything(),
    );
  });

  it("fails closed — an unavailable prosecutor writes a reject, never a silent allow", async () => {
    const setVerdict = setVerdictMock();
    const exec = vi.fn(async () => {
      throw new Error("codex not found");
    });
    const res = await sweepPendingRedTeam({
      proposals: [proposal({ id: "a", redTeam: null })],
      exec,
      setVerdict,
    });
    expect(res.swept).toBe(1);
    expect(setVerdict.mock.calls[0][1].verdict).toBe("reject");
  });
});
