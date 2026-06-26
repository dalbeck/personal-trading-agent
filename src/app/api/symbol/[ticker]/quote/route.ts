import { getLatestPrice, hasAlpacaCredentials } from "@/lib/server/alpaca";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";

/**
 * The symbol's **current** Alpaca price (fresh-entry-levels M1) — read-only, used
 * by the proposal levels-freshness indicator to show "price now $X" and detect
 * when an anchored entry has drifted stale. Prices are Alpaca-only (charter).
 * Returns `{ price: null }` when off/unavailable — the UI shows "—", never a
 * fabricated number.
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
    return Response.json({ error: "invalid ticker" }, { status: 400 });
  }
  if (!hasAlpacaCredentials()) {
    return Response.json({ price: null });
  }
  const price = await getLatestPrice(symbol).catch(() => null);
  return Response.json({ price });
}
