import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";
import { readWatchlistEntries } from "@/lib/server/data";
import { addToWatchlist, removeFromWatchlist } from "@/lib/server/writers";

/**
 * Edit the manual watchlist (the editable half of the tracked universe). A
 * local data-state mutation only — like the proposal-review endpoint, it never
 * touches a broker or an order path, so it is not order-gated. Symbols are
 * validated + normalized server-side before they are persisted.
 *
 * LOCAL only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ entries: await readWatchlistEntries() });
}

export async function POST(req: Request): Promise<Response> {
  let body: { action?: string; symbol?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { action } = body;
  if (action !== "add" && action !== "remove") {
    return Response.json(
      { error: "action must be 'add' or 'remove'" },
      { status: 400 },
    );
  }

  const symbol = typeof body.symbol === "string" ? normalizeSymbol(body.symbol) : "";
  if (!isValidSymbol(symbol)) {
    return Response.json({ error: "invalid symbol" }, { status: 400 });
  }

  const entries =
    action === "add"
      ? await addToWatchlist(symbol)
      : await removeFromWatchlist(symbol);

  return Response.json({ entries });
}
