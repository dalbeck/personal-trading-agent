import { describe, expect, it, vi } from "vitest";
import type { TradeProposal } from "@/lib/types";
import { expireStaleProposals, isProposalExpired } from "./proposal-expiry";

const NOW = "2026-06-25T12:00:00-04:00";
const nowMs = Date.parse(NOW);

function proposal(over: Partial<TradeProposal> = {}): TradeProposal {
  return {
    id: "p",
    createdAt: "2026-06-24T10:00:00-04:00",
    symbol: "NVDA",
    action: "buy",
    side: "long",
    qty: 1,
    limitPrice: 100,
    stopPrice: 95,
    takeProfit: 130,
    riskPct: 0.01,
    thesis: "t",
    reasoning: "r",
    status: "pending",
    sector: "Technology",
    reviewByDate: null,
    ...over,
  } as unknown as TradeProposal;
}

describe("isProposalExpired", () => {
  it("expires a proposal whose reviewByDate has passed", () => {
    expect(
      isProposalExpired(proposal({ reviewByDate: "2026-06-24" }), nowMs, 5),
    ).toBe(true);
  });

  it("expires a proposal older than maxAgeDays with no reviewByDate", () => {
    // created 2026-06-19 → 6 days before NOW (> 5).
    expect(
      isProposalExpired(
        proposal({ createdAt: "2026-06-19T10:00:00-04:00" }),
        nowMs,
        5,
      ),
    ).toBe(true);
  });

  it("keeps a fresh proposal (within the window, reviewByDate not passed)", () => {
    expect(
      isProposalExpired(
        proposal({ createdAt: "2026-06-24T10:00:00-04:00", reviewByDate: "2026-06-30" }),
        nowMs,
        5,
      ),
    ).toBe(false);
  });
});

describe("expireStaleProposals", () => {
  it("flips stale pending proposals to expired via the seam and counts them", async () => {
    const setStatus = vi.fn(async () => ({ id: "x", file: "f" }));
    const res = await expireStaleProposals({
      now: NOW,
      maxAgeDays: 5,
      setStatus,
      proposals: [
        proposal({ id: "stale", createdAt: "2026-06-18T10:00:00-04:00" }), // 7d old
        proposal({ id: "fresh", createdAt: "2026-06-24T10:00:00-04:00" }), // 1d old
      ],
    });
    expect(res.expired).toBe(1);
    expect(setStatus).toHaveBeenCalledWith("stale", "expired", expect.anything());
    expect(setStatus).not.toHaveBeenCalledWith("fresh", "expired", expect.anything());
  });

  it("only considers pending proposals (readProposals is pendingOnly by default)", async () => {
    const setStatus = vi.fn(async () => ({ id: "x", file: "f" }));
    // An already-approved stale proposal must NOT be re-expired.
    const res = await expireStaleProposals({
      now: NOW,
      maxAgeDays: 5,
      setStatus,
      proposals: [
        proposal({ id: "done", status: "approved", createdAt: "2026-06-10T10:00:00-04:00" }),
      ],
    });
    expect(res.expired).toBe(0);
    expect(setStatus).not.toHaveBeenCalled();
  });
});
