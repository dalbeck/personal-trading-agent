import { getSymbolBars } from "@/lib/server/symbol";
import {
  DEFAULT_RANGE,
  SYMBOL_RANGES,
  isValidSymbol,
  normalizeSymbol,
  type SymbolRange,
} from "@/lib/symbol";

/**
 * Chart bars for one symbol + range, for the price chart's range tabs. Keys
 * never leave the server — the client only ever sees the close series. LOCAL,
 * read-only; returns an empty series (never an error page) when off/unavailable.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRange(raw: string | null): SymbolRange {
  return (SYMBOL_RANGES as readonly string[]).includes(raw ?? "")
    ? (raw as SymbolRange)
    : DEFAULT_RANGE;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> },
): Promise<Response> {
  const { ticker } = await params;
  const symbol = normalizeSymbol(ticker);
  if (!isValidSymbol(symbol)) {
    return Response.json({ error: "invalid symbol" }, { status: 400 });
  }

  const range = parseRange(new URL(req.url).searchParams.get("range"));
  const points = await getSymbolBars(symbol, range);
  return Response.json({ symbol, range, points });
}
