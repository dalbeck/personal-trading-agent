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
const markTrancheFilled = vi.fn();

vi.mock("@/lib/server/data", () => ({
  readProposals: (...a: unknown[]) => readProposals(...a),
}));
vi.mock("@/lib/server/live-order", () => ({
  submitTradeApproval: (...a: unknown[]) => submitTradeApproval(...a),
}));
vi.mock("@/lib/server/writers", () => ({
  setProposalStatus: (...a: unknown[]) => setProposalStatus(...a),
  markTrancheFilled: (...a: unknown[]) => markTrancheFilled(...a),
}));

/** A 3-tranche staged plan over a full qty of 9 (3 + 3 + 3). */
const PLAN = {
  trancheCount: 3,
  intervalDays: 5,
  driftBandPct: 0.05,
  tranches: [
    { index: 0, fraction: 1 / 3, qty: 3, offsetDays: 0, status: "pending" },
    { index: 1, fraction: 1 / 3, qty: 3, offsetDays: 5, status: "pending" },
    { index: 2, fraction: 1 / 3, qty: 3, offsetDays: 10, status: "pending" },
  ],
};

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

const TOKEN = "test-trigger-token";

/** An authorized same-origin-equivalent request (localhost Host + bearer). */
function post(body: unknown): Request {
  return new Request("http://127.0.0.1:3000/api/live/approve", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "127.0.0.1:3000",
      authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  readProposals.mockReset();
  submitTradeApproval.mockReset();
  setProposalStatus.mockReset();
  markTrancheFilled.mockReset();
  setProposalStatus.mockResolvedValue({ id: "p-1", file: "x" });
  markTrancheFilled.mockResolvedValue({ id: "p-1" });
  process.env.ROUTINE_TRIGGER_TOKEN = TOKEN;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ROUTINE_TRIGGER_TOKEN;
});

describe("POST /api/live/approve — auth gate (fail closed)", () => {
  function raw(headers: Record<string, string>): Request {
    return new Request("http://127.0.0.1:3000/api/live/approve", {
      method: "POST",
      headers,
      body: JSON.stringify({ proposalId: "p-1", decision: "approve" }),
    });
  }

  it("fails closed (503) with no token, never reading proposals or routing an order", async () => {
    readProposals.mockResolvedValue([]);
    delete process.env.ROUTINE_TRIGGER_TOKEN;
    const res = await POST(raw({ host: "127.0.0.1:3000", "sec-fetch-site": "same-origin" }));
    expect(res.status).toBe(503);
    expect(readProposals).not.toHaveBeenCalled();
    expect(submitTradeApproval).not.toHaveBeenCalled();
  });

  it("rejects a cross-site browser request (403) before any side effect", async () => {
    readProposals.mockResolvedValue([]);
    const res = await POST(raw({ host: "127.0.0.1:3000", "sec-fetch-site": "cross-site" }));
    expect(res.status).toBe(403);
    expect(readProposals).not.toHaveBeenCalled();
    expect(submitTradeApproval).not.toHaveBeenCalled();
  });

  it("lets an authorized caller past the gate (reaches proposal lookup → 404)", async () => {
    readProposals.mockResolvedValue([]);
    const res = await POST(raw({ host: "127.0.0.1:3000", authorization: `Bearer ${TOKEN}` }));
    expect(res.status).toBe(404);
    expect(readProposals).toHaveBeenCalledTimes(1);
  });
});

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

describe("POST /api/live/approve — staged-entry tranches (M2)", () => {
  it("places only the tranche's qty and marks it filled — proposal stays pending", async () => {
    readProposals.mockResolvedValue([proposal({ qty: 9, stagedPlan: PLAN })]);
    submitTradeApproval.mockResolvedValue({
      outcome: "approved",
      destination: "mock",
      dryRun: true,
    });

    const res = await POST(
      post({ proposalId: "p-1", decision: "approve", tranche: 0 }),
    );
    expect(res.status).toBe(200);
    const arg = submitTradeApproval.mock.calls[0][0] as {
      order: { qty: number; tags?: string[] };
      idempotencyKey: string;
    };
    // The order is the TRANCHE qty (3), not the full position (9).
    expect(arg.order.qty).toBe(3);
    expect(arg.order.tags).toContain("tranche:1/3");
    // Each tranche dedupes independently.
    expect(arg.idempotencyKey).toBe("p-1#t0");
    // Only THIS tranche is marked filled; the proposal isn't blanket-approved.
    expect(markTrancheFilled).toHaveBeenCalledWith("p-1", 0);
    expect(setProposalStatus).not.toHaveBeenCalled();
  });

  it("ignores an already-filled tranche index and approves the full position", async () => {
    const filled = {
      ...PLAN,
      tranches: PLAN.tranches.map((t) =>
        t.index === 0 ? { ...t, status: "filled" } : t,
      ),
    };
    readProposals.mockResolvedValue([proposal({ qty: 9, stagedPlan: filled })]);
    submitTradeApproval.mockResolvedValue({
      outcome: "approved",
      destination: "mock",
      dryRun: true,
    });

    // Re-approving tranche 0 (already filled) is not honoured as a tranche → the
    // request falls back to the full-position approve (qty 9).
    const res = await POST(
      post({ proposalId: "p-1", decision: "approve", tranche: 0 }),
    );
    expect(res.status).toBe(200);
    const arg = submitTradeApproval.mock.calls[0][0] as {
      order: { qty: number };
    };
    expect(arg.order.qty).toBe(9);
    expect(markTrancheFilled).not.toHaveBeenCalled();
  });
});
