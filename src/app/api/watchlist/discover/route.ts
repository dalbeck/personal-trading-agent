import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";
import { addDiscoveredToWatchlist } from "@/lib/server/writers";
import { DISCOVERY_LIMITS } from "@strategy/charter.config";

/**
 * Auto-add discovered candidates to the watchlist (the autonomous-discovery
 * path, M3). Called by the research/discovery routine — token-gated like the
 * routine trigger / research endpoint, and LOCAL only.
 *
 * Tracking-only: this adds symbols to the tracked universe so the scout/research
 * follow them. It touches NO broker and NO order path. The add is bounded in
 * code by `DISCOVERY_LIMITS.maxWatchlistSymbols` (it stops at the ceiling and
 * never evicts a human's manual entries).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const token = process.env.ROUTINE_TRIGGER_TOKEN;
  if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { symbols?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.symbols)) {
    return Response.json(
      { error: "symbols (string[]) is required" },
      { status: 400 },
    );
  }

  // Normalize + validate the candidates; the writer enforces the cap + dedupe.
  const symbols = body.symbols
    .filter((s): s is string => typeof s === "string")
    .map(normalizeSymbol)
    .filter(isValidSymbol);

  const { entries, added } = await addDiscoveredToWatchlist(symbols);
  return Response.json({
    entries,
    added,
    cap: DISCOVERY_LIMITS.maxWatchlistSymbols,
  });
}
