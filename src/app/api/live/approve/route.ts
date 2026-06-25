import { readProposals } from "@/lib/server/data";
import { submitTradeApproval } from "@/lib/server/live-order";
import { setProposalStatus } from "@/lib/server/writers";
import { isAdvisoryProposal } from "@/lib/proposal-advisory";

/**
 * Per-trade human approval endpoint (Phase 3 M3). The dashboard posts the
 * human's approve/deny decision here; the order is routed through the gate and
 * the decision is journaled. With the harness gate closed (the shipped
 * default), an approved order lands in the **dry-run sink** (Alpaca paper or a
 * mock broker) — never Robinhood. The Robinhood path is wired but unreachable
 * until the gate opens (M5).
 *
 * LOCAL ONLY and deliberately human-initiated. Never expose this server
 * publicly. This endpoint cannot place a real-money order while the gate is
 * closed; the gate, not this route, is the safety boundary.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function nowET(): string {
  return new Date().toISOString();
}

export async function POST(req: Request): Promise<Response> {
  let body: {
    proposalId?: string;
    decision?: string;
    reason?: string;
    override?: { comment?: string } | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { proposalId, decision } = body;
  if (!proposalId || (decision !== "approve" && decision !== "deny")) {
    return Response.json(
      { error: "proposalId and decision ('approve'|'deny') are required" },
      { status: 400 },
    );
  }

  const proposals = await readProposals();
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return Response.json({ error: "unknown proposal" }, { status: 404 });
  }
  if (proposal.status !== "pending") {
    return Response.json(
      { error: `proposal already ${proposal.status}` },
      { status: 409 },
    );
  }

  // HARD GUARD: a live-advisory proposal must NEVER reach the order router.
  // It is guidance the human executes manually in Robinhood; this endpoint is
  // the only entry to submitTradeApproval → routeApprovedOrder, so refusing
  // here (before any broker/sink call) makes execution unreachable for advisory
  // proposals by construction. Use POST /api/proposals/review to record that
  // the guidance was reviewed or dismissed.
  if (isAdvisoryProposal(proposal)) {
    return Response.json(
      {
        error:
          "advisory proposal: execute manually in Robinhood. No automated execution path exists — use the review/dismiss action.",
      },
      { status: 422 },
    );
  }

  const timestamp = nowET();
  let result;
  try {
    result = await submitTradeApproval({
      decision,
      approver: "human",
      timestamp,
      reason: body.reason,
      // A non-empty override comment lets the human override a red-team reject
      // and/or a rail violation; the server re-checks the comment is non-empty
      // (`hasValidOverride`), so a blank comment never bypasses a block.
      override:
        body.override && typeof body.override.comment === "string"
          ? { comment: body.override.comment }
          : null,
      order: {
        symbol: proposal.symbol,
        action: proposal.action,
        side: proposal.side,
        qty: proposal.qty,
        limitPrice: proposal.limitPrice,
        stopPrice: proposal.stopPrice,
        takeProfit: proposal.takeProfit,
        riskPct: proposal.riskPct,
        reviewDate: proposal.reviewByDate ?? timestamp.slice(0, 10),
        thesis: proposal.thesis,
        reasoning: proposal.reasoning,
        redTeam: proposal.redTeam,
        account: proposal.account,
      },
    });
  } catch (err) {
    // Defensive: never 500 on an order path. Leave the proposal pending.
    return Response.json(
      { outcome: "error", error: (err as Error).message, dryRun: true },
      { status: 502 },
    );
  }

  // A broker error leaves the proposal pending so it can be retried; any
  // resolved decision (approved / denied / blocked) updates the queue.
  if (result.outcome !== "error") {
    await setProposalStatus(
      proposalId,
      result.outcome === "approved" ? "approved" : "rejected",
    ).catch(() => null);
  }

  return Response.json(result, {
    status: result.outcome === "error" ? 502 : 200,
  });
}
