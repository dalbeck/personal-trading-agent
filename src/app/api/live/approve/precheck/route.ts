import { readProposals } from "@/lib/server/data";
import { requireAuthorized } from "@/lib/server/authorize";
import {
  approvalIsBlocked,
  evaluateApprovalBlocks,
} from "@/lib/server/live-order";
import { isAdvisoryProposal } from "@/lib/proposal-advisory";
import { lensSleeveOf, resolveActiveLens } from "@/lib/proposal-lens";
import { SLEEVES } from "@/lib/sleeves";
import type { Sleeve } from "@/lib/sleeves";

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
  const denied = requireAuthorized(req);
  if (denied) return denied;
  let body: { proposalId?: string; actingLens?: string };
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

  // Evaluate the blocks for the lens the human is acting under (dual-lens M1):
  // its red-team verdict + levels drive what blocks the order. Single-lens →
  // the lone top-level lens, so the precheck is unchanged.
  const actingLens: Sleeve | "trend" | "value" | undefined =
    body.actingLens === "trend" || body.actingLens === "value"
      ? body.actingLens
      : (SLEEVES as readonly string[]).includes(body.actingLens ?? "")
        ? (body.actingLens as Sleeve)
        : undefined;
  const lens = resolveActiveLens(proposal, actingLens);
  const blocks = await evaluateApprovalBlocks({
    symbol: proposal.symbol,
    action: proposal.action,
    side: proposal.side,
    qty: lens.qty,
    limitPrice: lens.limitPrice,
    stopPrice: lens.stopPrice,
    takeProfit: lens.takeProfit,
    riskPct: lens.riskPct,
    reviewDate: proposal.reviewByDate ?? new Date().toISOString().slice(0, 10),
    thesis: lens.thesis,
    reasoning: lens.reasoning,
    redTeam: lens.redTeam,
    account: proposal.account,
    sector: proposal.sector,
    // The acting sleeve drives the per-sleeve rails in the precheck too
    // (verdict-matrix M7), so a core-long lens prechecks under its review trigger.
    sleeve: lensSleeveOf(lens),
    reviewTriggerPct: lens.reviewTriggerPct,
    targetWeightPct: lens.targetWeightPct,
    targetType: lens.targetType,
    relativeVolume: lens.relativeVolume,
    catalyst: lens.catalyst,
    catalystType: lens.catalystType,
  });

  return Response.json({
    redTeamRejects: blocks.redTeamRejects,
    redTeamNotes: blocks.redTeam?.notes ?? null,
    railViolations: blocks.railViolations,
    capViolations: blocks.capViolations,
    // Stale-levels guard (fresh-entry-levels M1): the entry has drifted from the
    // live quote; the remedy is a "Refresh levels" re-anchor, not an override.
    staleLevels: blocks.staleLevels,
    liveEnabled: blocks.liveEnabled,
    blocked: approvalIsBlocked(blocks),
  });
}
