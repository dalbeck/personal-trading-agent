import { getSymbolResearch } from "@/lib/server/symbol-research";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";

/**
 * Manual research refresh (force a refetch for one symbol). Unlike the auto-load
 * `highlights` route — which is cache-first and only refetches past the soft
 * max-age — this **always** re-spends (Robinhood read + a metered Perplexity
 * call), so it is the user's deliberate "Refresh" action.
 *
 * The Perplexity **daily cap still gates the spend**: a capped refresh keeps the
 * existing cache and surfaces the `capped` status instead of wiping it. LOCAL,
 * research/context only — never order pricing or execution.
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

  const research = await getSymbolResearch(symbol, { force: true });
  return Response.json(research);
}
