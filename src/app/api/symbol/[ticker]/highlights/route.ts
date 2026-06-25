import { getResearchCallCount } from "@/lib/server/research/usage";
import { getResearchProvider } from "@/lib/server/research";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";

/**
 * Symbol "highlights" via the capped Perplexity `finance_search` provider. The
 * Perplexity-style symbol layout **auto-loads** this once per visit (the price
 * header / stats / profile / consensus fan out from the single result). The
 * provider is **default-off** (`RESEARCH_PROVIDER=off`) and the daily cap is
 * enforced **in code** inside the provider, so this route can only spend one
 * capped call per visit and refuses gracefully past the cap — the cap is the
 * cost guard for auto-loading.
 *
 * Research/context only — never order pricing or execution. LOCAL, read-only.
 * Returns `{ off | capped, result }` so the UI falls back to "—" and the
 * link-outs with a clear note instead of an error.
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

  const provider = getResearchProvider();
  if (provider.name === "off") {
    return Response.json({ off: true, capped: false, result: null });
  }

  const result = await provider.research({ symbol });
  if (result) {
    return Response.json({ off: false, capped: false, result });
  }

  // Null with the provider on means: cap hit, missing key, or a transient
  // failure. Surface whether it was the cap so the note can be precise.
  const cap = Number(process.env.PERPLEXITY_DAILY_CALL_CAP ?? "30");
  const used = await getResearchCallCount(new Date().toISOString().slice(0, 10));
  return Response.json({ off: false, capped: used >= cap, result: null });
}
