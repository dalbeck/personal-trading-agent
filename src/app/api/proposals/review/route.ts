import { readProposals } from "@/lib/server/data";
import { requireAuthorized } from "@/lib/server/authorize";
import { setProposalStatus } from "@/lib/server/writers";
import {
  ADVISORY_DECISIONS,
  isAdvisoryProposal,
  type AdvisoryDecision,
} from "@/lib/proposal-advisory";

/**
 * Review endpoint for **live-advisory** proposals. The human records that the
 * guidance was `reviewed` (acted on manually in Robinhood) or `dismissed`. This
 * only updates the proposal's status — it deliberately does NOT import
 * `live-order.ts` or any broker/sink, so there is provably no execution path
 * reachable from here. The approval endpoint (`/api/live/approve`) is the only
 * order path and it refuses advisory proposals.
 *
 * LOCAL ONLY and human-initiated.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDecision(v: unknown): v is AdvisoryDecision {
  return (
    typeof v === "string" &&
    (ADVISORY_DECISIONS as readonly string[]).includes(v)
  );
}

export async function POST(req: Request): Promise<Response> {
  const denied = requireAuthorized(req);
  if (denied) return denied;
  let body: { proposalId?: string; decision?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { proposalId, decision } = body;
  if (!proposalId || !isDecision(decision)) {
    return Response.json(
      {
        error:
          "proposalId and decision ('reviewed'|'dismissed') are required",
      },
      { status: 400 },
    );
  }

  const proposals = await readProposals();
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return Response.json({ error: "unknown proposal" }, { status: 404 });
  }

  // This path is for advisory proposals only. A paper proposal goes through the
  // approval flow; refusing it here keeps the two lifecycles cleanly separate.
  if (!isAdvisoryProposal(proposal)) {
    return Response.json(
      { error: "not an advisory proposal — use the approval flow" },
      { status: 422 },
    );
  }

  const written = await setProposalStatus(proposalId, decision).catch(
    () => null,
  );
  if (!written) {
    return Response.json(
      { error: "could not update proposal" },
      { status: 500 },
    );
  }

  return Response.json({ outcome: decision, proposalId }, { status: 200 });
}
