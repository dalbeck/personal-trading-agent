import { readProposals } from "@/lib/server/data";
import { submitTradeApproval } from "@/lib/server/live-order";
import { setProposalStatus } from "@/lib/server/writers";
import { isAdvisoryProposal } from "@/lib/proposal-advisory";
import { resolveActiveLens } from "@/lib/proposal-lens";

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
    // Which lens the human acted under (dual-lens M1). For a dual-lens proposal
    // this selects the lens whose levels + red-team verdict drive the order; it
    // is also recorded in the journal as the decision rationale. Ignored for a
    // single-lens proposal. Never trust the client to widen scope — only the two
    // known strategies are honoured.
    actingLens?: string;
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
  // The acting lens (dual-lens M1): its levels + red-team verdict drive the
  // order, and the order is risk-checked + gated under it — exactly as if it were
  // a single-lens proposal at those levels. For a single-lens proposal this is
  // the lone top-level lens, so behaviour is unchanged.
  const actingLens =
    body.actingLens === "trend" || body.actingLens === "value"
      ? body.actingLens
      : undefined;
  const lens = resolveActiveLens(proposal, actingLens);
  const isDual = (proposal.lenses ?? []).length > 0;
  // Carry the proposal's origin (manual analyze → `manual-request`, M2) and the
  // acting lens (dual-lens → `lens:<strategy>`) into the journal so the decision
  // basis is auditable.
  const tags: string[] = [];
  if (proposal.origin === "manual-request") tags.push("manual-request");
  if (isDual) tags.push(`lens:${lens.strategy}`);

  let result;
  try {
    result = await submitTradeApproval({
      decision,
      approver: "human",
      timestamp,
      reason: body.reason,
      // Stable idempotency key = the proposal id, so a double-tap or retry of
      // this approval places at most once (the per-request timestamp must NOT
      // be the key — it changes every call).
      idempotencyKey: proposalId,
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
        qty: lens.qty,
        limitPrice: lens.limitPrice,
        stopPrice: lens.stopPrice,
        takeProfit: lens.takeProfit,
        riskPct: lens.riskPct,
        reviewDate: proposal.reviewByDate ?? timestamp.slice(0, 10),
        thesis: lens.thesis,
        reasoning: lens.reasoning,
        redTeam: lens.redTeam,
        account: proposal.account,
        sector: proposal.sector,
        targetType: lens.targetType,
        relativeVolume: lens.relativeVolume,
        catalyst: lens.catalyst,
        catalystType: lens.catalystType,
        tags: tags.length > 0 ? tags : undefined,
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
