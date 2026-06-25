import { getResearchFreshness } from "@/lib/server/symbol-research";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";

/**
 * Cache-only research freshness for one symbol — reads the cache and returns its
 * `fetchedAt`, **without ever fetching**. Safe to call per-proposal on the
 * proposals page (no metered Perplexity spend). The proposal card uses it to
 * show how old the linked symbol's research is; the (force-spending) Refresh
 * action lives behind the separate `research/refresh` route.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
): Promise<Response> {
  const { ticker } = await params;
  const symbol = normalizeSymbol(ticker);
  if (!isValidSymbol(symbol)) {
    return Response.json({ error: "invalid symbol" }, { status: 400 });
  }
  return Response.json(await getResearchFreshness(symbol));
}
