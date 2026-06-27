import { refreshProposalResearch } from "@/lib/server/refresh-research";

/**
 * Rebuild ONE proposal's value-lens fields (cashFlow / dividend / catalyst /
 * conviction / red-team) from a FRESH research fetch and overwrite it in place
 * (proposal-refresh-rebuilds M3). The user's deliberate "Refresh research"
 * action — it re-runs the analysis rather than just bumping the symbol cache, so
 * a stored proposal can never read "data unavailable" while the freshness badge
 * says fresh. Levels are re-anchored to the current quote too.
 *
 * It places nothing and touches no order path. Scoped to manual-request
 * (analyze-a-symbol) proposals. LOCAL.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_STATUS: Record<string, number> = {
  "not-found": 404,
  "not-rebuildable": 409,
  "no-snapshot": 409,
  "insufficient-data": 422,
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const result = await refreshProposalResearch(id);
  if (!result.ok) {
    return Response.json(
      { error: result.error, code: result.code },
      { status: ERROR_STATUS[result.code] ?? 500 },
    );
  }
  return Response.json({
    ok: true,
    researchAt: result.researchAt,
    pricedAt: result.proposal.pricedAt,
    researchStatus: result.proposal.researchStatus,
  });
}
