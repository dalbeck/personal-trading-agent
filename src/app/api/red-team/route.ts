import { runRedTeam, type RedTeamProposal } from "@/lib/server/red-team";
import { toRedTeamProposal } from "@/lib/server/red-team-briefing";
import { requireAuthorized } from "@/lib/server/authorize";

/**
 * Run the cross-model **red-team** (codex prosecutor) on a candidate and return
 * its verdict, so the discovery routine can attach it to each proposal — the
 * human sees the verdict + notes at review time, and the charter's "every trade
 * clears the red-team" rule is satisfied at generation. Token-gated (the routine
 * supplies the bearer) and LOCAL only. Read-only w.r.t. trading — it places
 * nothing; it only judges. Fails closed (a reject) if the prosecutor errors.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const denied = requireAuthorized(req);
  if (denied) return denied;

  let body: Partial<RedTeamProposal>;
  try {
    body = (await req.json()) as Partial<RedTeamProposal>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (
    !body.symbol ||
    (body.action !== "buy" && body.action !== "sell") ||
    typeof body.limitPrice !== "number" ||
    !body.thesis
  ) {
    return Response.json(
      { error: "symbol, action ('buy'|'sell'), limitPrice, and thesis are required" },
      { status: 400 },
    );
  }

  // Route through the shared briefing mapper (H3) so a value/core candidate is
  // judged under its own lens with the full briefing — whatever fields the caller
  // supplies (strategy/sleeve/cashFlow/dividend/…) flow through consistently.
  const verdict = await runRedTeam(
    toRedTeamProposal({
      ...body,
      symbol: body.symbol,
      action: body.action,
      side: body.side ?? "long",
      qty: body.qty ?? 0,
      limitPrice: body.limitPrice,
      stopPrice: body.stopPrice ?? null,
      takeProfit: body.takeProfit ?? null,
      thesis: body.thesis,
    }),
  );

  return Response.json(verdict);
}
