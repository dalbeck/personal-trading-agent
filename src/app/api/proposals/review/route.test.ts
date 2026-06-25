import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The advisory review endpoint records reviewed/dismissed without any execution.
 * It imports only the data reader + the status writer — never `live-order.ts`.
 * These tests prove it updates status for advisory proposals, refuses paper
 * ones, and (defensively) that the order module is never touched.
 */

const readProposals = vi.fn();
const setProposalStatus = vi.fn();
const submitTradeApproval = vi.fn();

vi.mock("@/lib/server/data", () => ({
  readProposals: (...a: unknown[]) => readProposals(...a),
}));
vi.mock("@/lib/server/writers", () => ({
  setProposalStatus: (...a: unknown[]) => setProposalStatus(...a),
}));
vi.mock("@/lib/server/live-order", () => ({
  submitTradeApproval: (...a: unknown[]) => submitTradeApproval(...a),
}));

import { POST } from "./route";

function proposal(over: Record<string, unknown> = {}) {
  return {
    id: "p-1",
    symbol: "NVDA",
    action: "sell",
    status: "pending",
    account: "live",
    advisory: true,
    ...over,
  };
}

function post(body: unknown): Request {
  return new Request("http://127.0.0.1:3000/api/proposals/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  readProposals.mockReset();
  setProposalStatus.mockReset();
  submitTradeApproval.mockReset();
  setProposalStatus.mockResolvedValue({ id: "p-1", file: "x" });
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/proposals/review", () => {
  it.each(["reviewed", "dismissed"] as const)(
    "sets an advisory proposal to %s (no order path)",
    async (decision) => {
      readProposals.mockResolvedValue([proposal()]);
      const res = await POST(post({ proposalId: "p-1", decision }));
      expect(res.status).toBe(200);
      expect(setProposalStatus).toHaveBeenCalledWith("p-1", decision);
      expect(submitTradeApproval).not.toHaveBeenCalled();
    },
  );

  it("rejects an invalid decision", async () => {
    const res = await POST(post({ proposalId: "p-1", decision: "approve" }));
    expect(res.status).toBe(400);
    expect(setProposalStatus).not.toHaveBeenCalled();
  });

  it("404s an unknown proposal", async () => {
    readProposals.mockResolvedValue([]);
    const res = await POST(post({ proposalId: "nope", decision: "reviewed" }));
    expect(res.status).toBe(404);
  });

  it("refuses a non-advisory (paper) proposal — use the approval flow", async () => {
    readProposals.mockResolvedValue([
      proposal({ account: "paper", advisory: false }),
    ]);
    const res = await POST(post({ proposalId: "p-1", decision: "reviewed" }));
    expect(res.status).toBe(422);
    expect(setProposalStatus).not.toHaveBeenCalled();
  });
});
