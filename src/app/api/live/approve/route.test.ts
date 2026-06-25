import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The decisive safety test for live-advisory proposals: the approval endpoint
 * is the ONLY entry to the order router (`submitTradeApproval` →
 * `routeApprovedOrder` → broker/sink). If an advisory proposal can never reach
 * `submitTradeApproval` here, no execution path is reachable from it.
 *
 * We mock the data reader (to serve a chosen proposal) and the order module (to
 * prove it is never invoked for an advisory proposal, and IS invoked for a
 * paper one).
 */

const readProposals = vi.fn();
const submitTradeApproval = vi.fn();
const setProposalStatus = vi.fn();

vi.mock("@/lib/server/data", () => ({
  readProposals: (...a: unknown[]) => readProposals(...a),
}));
vi.mock("@/lib/server/live-order", () => ({
  submitTradeApproval: (...a: unknown[]) => submitTradeApproval(...a),
}));
vi.mock("@/lib/server/writers", () => ({
  setProposalStatus: (...a: unknown[]) => setProposalStatus(...a),
}));

import { POST } from "./route";

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    createdAt: "2026-06-24T10:00:00-04:00",
    symbol: "NVDA",
    action: "sell",
    side: "long",
    qty: 0.2,
    limitPrice: 148,
    stopPrice: null,
    takeProfit: null,
    riskPct: 0.004,
    confidence: null,
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
  return new Request("http://127.0.0.1:3000/api/live/approve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  readProposals.mockReset();
  submitTradeApproval.mockReset();
  setProposalStatus.mockReset();
  setProposalStatus.mockResolvedValue({ id: "p-1", file: "x" });
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/live/approve — advisory proposals are non-executable", () => {
  it("REFUSES a live-advisory proposal and never calls the order router", async () => {
    readProposals.mockResolvedValue([
      proposal({ account: "live", advisory: true }),
    ]);

    const res = await POST(post({ proposalId: "p-1", decision: "approve" }));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toMatch(/advisory/i);
    // The single most important assertion: the order path was never entered.
    expect(submitTradeApproval).not.toHaveBeenCalled();
    expect(setProposalStatus).not.toHaveBeenCalled();
  });

  it("ROUTES an approvable live proposal (advisory:false) through the order path", async () => {
    // Approvable live proposals are NOT advisory — the human can approve them
    // and the app routes the order. The GATE (not this route) is the real-money
    // boundary: gate-closed it lands in the dry-run sink. So it must reach
    // submitTradeApproval, where routing/gating happens.
    readProposals.mockResolvedValue([
      proposal({ account: "live", advisory: false }),
    ]);
    submitTradeApproval.mockResolvedValue({
      outcome: "approved",
      destination: "alpaca-paper",
      dryRun: true,
    });

    const res = await POST(post({ proposalId: "p-1", decision: "approve" }));
    expect(res.status).toBe(200);
    expect(submitTradeApproval).toHaveBeenCalledTimes(1);
    // Gate-closed → dry-run sink, never Robinhood.
    const body = await res.json();
    expect(body.dryRun).toBe(true);
    expect(body.destination).not.toBe("robinhood");
  });

  it("still routes a normal PAPER proposal through the order path", async () => {
    readProposals.mockResolvedValue([proposal()]); // paper, non-advisory
    submitTradeApproval.mockResolvedValue({
      outcome: "approved",
      destination: "alpaca-paper",
      dryRun: true,
    });

    const res = await POST(post({ proposalId: "p-1", decision: "approve" }));
    expect(res.status).toBe(200);
    expect(submitTradeApproval).toHaveBeenCalledTimes(1);
  });

  it("forwards a non-empty override comment to submitTradeApproval", async () => {
    readProposals.mockResolvedValue([proposal()]);
    submitTradeApproval.mockResolvedValue({
      outcome: "approved",
      destination: "mock",
      dryRun: true,
    });

    await POST(
      post({
        proposalId: "p-1",
        decision: "approve",
        override: { comment: "I accept the event risk." },
      }),
    );
    const arg = submitTradeApproval.mock.calls[0][0] as {
      override: { comment: string } | null;
    };
    expect(arg.override).toEqual({ comment: "I accept the event risk." });
  });

  it("passes a null override when none is provided", async () => {
    readProposals.mockResolvedValue([proposal()]);
    submitTradeApproval.mockResolvedValue({
      outcome: "approved",
      destination: "mock",
      dryRun: true,
    });

    await POST(post({ proposalId: "p-1", decision: "approve" }));
    const arg = submitTradeApproval.mock.calls[0][0] as {
      override: unknown;
    };
    expect(arg.override).toBeNull();
  });
});
