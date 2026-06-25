import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The approve precheck must be READ-ONLY: it reports what blocks an order so the
 * dialog can show the 2-step override, but it journals nothing and places
 * nothing. It also refuses advisory proposals (no order path) and unknown ids.
 */

const readProposals = vi.fn();
const evaluateApprovalBlocks = vi.fn();

vi.mock("@/lib/server/data", () => ({
  readProposals: (...a: unknown[]) => readProposals(...a),
}));
vi.mock("@/lib/server/live-order", () => ({
  evaluateApprovalBlocks: (...a: unknown[]) => evaluateApprovalBlocks(...a),
  approvalIsBlocked: (b: {
    redTeamRejects: boolean;
    railViolations: unknown[];
    capViolations: unknown[];
  }) => b.redTeamRejects || b.railViolations.length > 0 || b.capViolations.length > 0,
}));

import { POST } from "./route";

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    symbol: "NVDA",
    action: "buy",
    side: "long",
    qty: 1,
    limitPrice: 148,
    stopPrice: 140,
    takeProfit: 170,
    riskPct: 0.01,
    thesis: "t",
    reasoning: "r",
    status: "pending",
    account: "paper",
    advisory: false,
    redTeam: null,
    reviewByDate: null,
    sample: false,
    ...over,
  };
}

function post(body: unknown): Request {
  return new Request("http://127.0.0.1:3000/api/live/approve/precheck", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  readProposals.mockReset();
  evaluateApprovalBlocks.mockReset();
});

describe("POST /api/live/approve/precheck", () => {
  it("reports the blocks for a blocked order (read-only)", async () => {
    readProposals.mockResolvedValue([proposal()]);
    evaluateApprovalBlocks.mockResolvedValue({
      redTeam: { verdict: "reject", notes: "Crowded long.", factors: [], basis: null },
      redTeamRejects: true,
      railViolations: [{ rule: "position-size", message: "too big" }],
      capViolations: [],
      liveEnabled: false,
    });

    const res = await POST(post({ proposalId: "p-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.blocked).toBe(true);
    expect(body.redTeamRejects).toBe(true);
    expect(body.redTeamNotes).toBe("Crowded long.");
    expect(body.railViolations).toHaveLength(1);
    expect(evaluateApprovalBlocks).toHaveBeenCalledTimes(1);
  });

  it("reports a clean order as not blocked", async () => {
    readProposals.mockResolvedValue([proposal()]);
    evaluateApprovalBlocks.mockResolvedValue({
      redTeam: { verdict: "approve", notes: "ok", factors: [], basis: null },
      redTeamRejects: false,
      railViolations: [],
      capViolations: [],
      liveEnabled: false,
    });
    const res = await POST(post({ proposalId: "p-1" }));
    const body = await res.json();
    expect(body.blocked).toBe(false);
  });

  it("refuses an advisory proposal (no order path)", async () => {
    readProposals.mockResolvedValue([proposal({ advisory: true, account: "live" })]);
    const res = await POST(post({ proposalId: "p-1" }));
    expect(res.status).toBe(422);
    expect(evaluateApprovalBlocks).not.toHaveBeenCalled();
  });

  it("404s an unknown proposal", async () => {
    readProposals.mockResolvedValue([]);
    const res = await POST(post({ proposalId: "nope" }));
    expect(res.status).toBe(404);
  });
});
