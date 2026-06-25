import { getSymbolResearch } from "@/lib/server/symbol-research";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";

/**
 * Symbol research for the Perplexity-style layout. The page **auto-loads** this
 * once per visit; the result (fundamentals, profile, analyst consensus, AI
 * summary) fans out to every island.
 *
 * Sourcing is cheapest-first: **Robinhood** `get_equity_fundamentals` (read-only,
 * no metered cost) for fundamentals + profile, **Perplexity** `finance_search`
 * (metered, default-off, daily-capped in code) as the auto-fallback that also
 * supplies analyst consensus + the AI narrative. The merged payload is **cached
 * per-symbol-per-day**, so a refresh / navigate-back never re-spends — the cache
 * + the in-code cap are the cost guards.
 *
 * Research/context only — never order pricing or execution. LOCAL, read-only.
 * Always returns a `SymbolResearch` object (status flags inside) so the UI shows
 * "—" + the link-outs instead of an error.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
): Promise<Response> {
  const { ticker } = await params;
  const symbol = normalizeSymbol(ticker);
  if (!isValidSymbol(symbol)) {
    return Response.json({ error: "invalid symbol" }, { status: 400 });
  }

  const research = await getSymbolResearch(symbol);
  return Response.json(research);
}
