import { readProposals } from "@/lib/server/data";
import {
  approvalIsBlocked,
  evaluateApprovalBlocks,
} from "@/lib/server/live-order";
import { isAdvisoryProposal } from "@/lib/proposal-advisory";

/**
 * Read-only precheck for the approve dialog (Phase 3 M7). Evaluates the blocks a
 * proposal faces — the red-team verdict, the risk-rail violations (with the
 * human's risk-settings overlay), and the live-cap violations — **without any
 * side effect** (no journal, no order). The dialog uses this to drive the 2-step
 * override: when something is blocked it shows the reason prominently and
 * requires a typed justification comment before "Override & approve".
 *
 * LOCAL, read-only. It places nothing and journals nothing.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: { proposalId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { proposalId } = body;
  if (!proposalId) {
    return Response.json({ error: "proposalId is required" }, { status: 400 });
  }

  const proposals = await readProposals();
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return Response.json({ error: "unknown proposal" }, { status: 404 });
  }
  if (isAdvisoryProposal(proposal)) {
    return Response.json(
      { error: "advisory proposal has no order path" },
      { status: 422 },
    );
  }

  const blocks = await evaluateApprovalBlocks({
    symbol: proposal.symbol,
    action: proposal.action,
    side: proposal.side,
    qty: proposal.qty,
    limitPrice: proposal.limitPrice,
    stopPrice: proposal.stopPrice,
    takeProfit: proposal.takeProfit,
    riskPct: proposal.riskPct,
    reviewDate: proposal.reviewByDate ?? new Date().toISOString().slice(0, 10),
    thesis: proposal.thesis,
    reasoning: proposal.reasoning,
    redTeam: proposal.redTeam,
    account: proposal.account,
    sector: proposal.sector,
    targetType: proposal.targetType,
    relativeVolume: proposal.relativeVolume,
    catalyst: proposal.catalyst,
    catalystType: proposal.catalystType,
  });

  return Response.json({
    redTeamRejects: blocks.redTeamRejects,
    redTeamNotes: blocks.redTeam?.notes ?? null,
    railViolations: blocks.railViolations,
    capViolations: blocks.capViolations,
    liveEnabled: blocks.liveEnabled,
    blocked: approvalIsBlocked(blocks),
  });
}
