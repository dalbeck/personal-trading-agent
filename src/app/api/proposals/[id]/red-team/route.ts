import { readProposals } from "@/lib/server/data";
import { runRedTeam } from "@/lib/server/red-team";
import { setProposalRedTeam } from "@/lib/server/writers";

/**
 * Re-run the cross-model red-team prosecutor for ONE proposal and overwrite its
 * stored verdict. Unlike the post-discovery sweep (which only judges proposals
 * that lack a verdict), this **always** re-judges — the user's deliberate action
 * after editing a thesis or wanting a second look. It **re-spends one ~10s codex
 * call**, so the UI confirm-gates it.
 *
 * This only judges — it places nothing and touches no order path. LOCAL.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const proposals = await readProposals();
  const proposal = proposals.find((p) => p.id === id);
  if (!proposal) {
    return Response.json({ error: "unknown proposal" }, { status: 404 });
  }

  const verdict = await runRedTeam({
    symbol: proposal.symbol,
    action: proposal.action,
    side: proposal.side,
    qty: proposal.qty,
    limitPrice: proposal.limitPrice,
    stopPrice: proposal.stopPrice,
    takeProfit: proposal.takeProfit,
    targetType: proposal.targetType,
    relativeVolume: proposal.relativeVolume,
    catalyst: proposal.catalyst,
    catalystType: proposal.catalystType,
    // Carry the catalyst evidence + state so a RE-RUN judges on the same briefing:
    // the sources (catalyst-news-sources M1) and — critically — the capture state
    // (catalyst-state-honesty M2), so an `unavailable` (failed-fetch) catalyst is
    // never re-rejected as "no catalyst".
    catalystSources: proposal.catalystSources,
    catalystState: proposal.catalystState,
    thesis: proposal.thesis,
    reasoning: proposal.reasoning,
  });

  const written = await setProposalRedTeam(id, verdict);
  if (!written) {
    return Response.json(
      { error: "could not persist the verdict" },
      { status: 500 },
    );
  }

  return Response.json({ verdict });
}
