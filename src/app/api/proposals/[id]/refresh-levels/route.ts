import { refreshProposalLevels } from "@/lib/server/refresh-levels";
import { requireAuthorized } from "@/lib/server/authorize";

/**
 * Re-anchor ONE proposal's entry/stop/target/sizing to the **current** Alpaca
 * quote (fresh-entry-levels M1) and overwrite it in place. The user's deliberate
 * "Refresh levels" action — the desk's correctness fix for a stale entry (the
 * JKHY case: $135 anchor vs ~$128 trading made the whole stop/R:R/sizing wrong).
 *
 * It recomputes levels off a fresh quote and re-runs the red-team per lens; it
 * does NOT re-fetch metered research (the narrative is reused) and mints no new
 * id. It places nothing and touches no order path. LOCAL.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERROR_STATUS: Record<string, number> = {
  "not-found": 404,
  "no-quote": 502,
  "no-snapshot": 409,
  "insufficient-data": 422,
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = requireAuthorized(req);
  if (denied) return denied;
  const { id } = await params;
  const result = await refreshProposalLevels(id);
  if (!result.ok) {
    return Response.json(
      { error: result.error, code: result.code },
      { status: ERROR_STATUS[result.code] ?? 500 },
    );
  }
  return Response.json({
    ok: true,
    pricedAt: result.proposal.pricedAt,
    limitPrice: result.proposal.limitPrice,
    quote: result.quote,
  });
}
