import { readProposals } from "@/lib/server/data";
import { submitTradeApproval } from "@/lib/server/live-order";
import {
  markTrancheFilled,
  setProposalStatus,
} from "@/lib/server/writers";
import { isAdvisoryProposal } from "@/lib/proposal-advisory";
import { lensSleeveOf, resolveActiveLens } from "@/lib/proposal-lens";
import { SLEEVES } from "@/lib/sleeves";
import type { Sleeve } from "@/lib/sleeves";
import { requireAuthorized } from "@/lib/server/authorize";

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
  const denied = requireAuthorized(req);
  if (denied) return denied;

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
    // Which staged-entry tranche the human is approving (staged-entry-plan M2).
    // When present + valid, the order places that tranche's qty (a fraction of the
    // full position) and that tranche is marked filled on success. Omitted →
    // the whole position (a non-staged proposal, unchanged).
    tranche?: number;
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
  // The acting lens the human picked (verdict-matrix M7) — a sleeve id (or a
  // legacy `trend`/`value`, which resolveActiveLens maps to its swing sleeve).
  const actingLens: Sleeve | "trend" | "value" | undefined =
    body.actingLens === "trend" || body.actingLens === "value"
      ? body.actingLens
      : (SLEEVES as readonly string[]).includes(body.actingLens ?? "")
        ? (body.actingLens as Sleeve)
        : undefined;
  const lens = resolveActiveLens(proposal, actingLens);
  const actingSleeve = lensSleeveOf(lens);
  const isDual = (proposal.lenses ?? []).length > 0;
  // Carry the proposal's origin (manual analyze → `manual-request`, M2) and the
  // acting lens into the journal so the decision basis is auditable.
  const tags: string[] = [];
  if (proposal.origin === "manual-request") tags.push("manual-request");
  if (isDual) tags.push(`lens:${lens.strategy}`);
  // Tag the trade with its acting sleeve (portfolio M5 / verdict-matrix M7) so a
  // holding can be attributed to a sleeve for allocation/drift.
  tags.push(`sleeve:${actingSleeve}`);

  // Staged-entry tranche (staged-entry-plan M2): when the human approves a
  // specific tranche, the order places THAT tranche's qty (a fraction of the full
  // position) — the risk rails + staleness guard re-check the accumulating book,
  // so completing every tranche is never over-risked. Only an in-range pending
  // tranche is honoured; anything else falls back to the full-position approve.
  const plan = proposal.stagedPlan;
  const trancheIdx =
    decision === "approve" &&
    plan &&
    typeof body.tranche === "number" &&
    Number.isInteger(body.tranche)
      ? plan.tranches.find((t) => t.index === body.tranche && t.status === "pending")
          ?.index ?? null
      : null;
  const tranche =
    trancheIdx !== null ? plan!.tranches.find((t) => t.index === trancheIdx)! : null;
  const orderQty = tranche ? tranche.qty : lens.qty;
  if (tranche) {
    tags.push(`tranche:${tranche.index + 1}/${plan!.tranches.length}`);
  }

  let result;
  try {
    result = await submitTradeApproval({
      decision,
      approver: "human",
      timestamp,
      reason: body.reason,
      // Stable idempotency key = the proposal id (or the proposal + tranche, so
      // each tranche dedupes independently but a double-tap of ONE tranche places
      // at most once). The per-request timestamp is never the key.
      idempotencyKey:
        tranche ? `${proposalId}#t${tranche.index}` : proposalId,
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
        qty: orderQty,
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
        // The acting SLEEVE drives the per-sleeve rails (per-sleeve-rails M2 /
        // verdict-matrix M7) — a core-long acting lens gates under its
        // review-trigger rail (no stop), not the swing rails.
        sleeve: actingSleeve,
        strategy: lens.strategy,
        reviewTriggerPct: lens.reviewTriggerPct,
        targetWeightPct: lens.targetWeightPct,
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
    if (tranche && result.outcome === "approved") {
      // Mark just THIS tranche filled — the proposal only flips to `approved`
      // once every tranche is filled (the staged entry is complete). A blocked
      // tranche leaves the plan untouched so the human can refresh/retry it.
      await markTrancheFilled(proposalId, tranche.index).catch(() => null);
    } else if (!tranche) {
      await setProposalStatus(
        proposalId,
        result.outcome === "approved" ? "approved" : "rejected",
      ).catch(() => null);
    }
  }

  return Response.json(
    { ...result, tranche: tranche ? tranche.index : undefined },
    { status: result.outcome === "error" ? 502 : 200 },
  );
}
