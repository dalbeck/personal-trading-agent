import {
  parseScanPreset,
  resolveScanFilters,
  type ScanFilters,
} from "@/lib/scanner";
import { requireAuthorized } from "@/lib/server/authorize";
import { runScan, ScannerUnavailableError } from "@/lib/server/scanner";

/**
 * Run a market scan (scanner-discovery M1). Resolves a `{ preset, filters }`
 * request into bounded filters, runs the scan through the host CLI's Robinhood
 * MCP session, and returns the ranked candidates.
 *
 * Discovery funnel ONLY: it places nothing, reads no brokerage account, and its
 * prices are indicative — every candidate is re-priced through Alpaca when it
 * enters the analyze pipeline. Gated on `SCANNER_ENABLED` + a live Robinhood
 * connection. LOCAL only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const denied = requireAuthorized(req);
  if (denied) return denied;
  let body: { preset?: unknown; filters?: Partial<ScanFilters> };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const preset = parseScanPreset(body.preset);
  const filters = resolveScanFilters(preset, body.filters ?? null);

  try {
    const results = await runScan(filters);
    return Response.json({
      ok: true,
      preset,
      filters,
      results,
      count: results.length,
    });
  } catch (err) {
    if (err instanceof ScannerUnavailableError) {
      // 403 = disabled (config), 409 = not connected (state).
      const status = err.reason === "disabled" ? 403 : 409;
      return Response.json(
        { ok: false, reason: err.reason, error: err.message },
        { status },
      );
    }
    return Response.json(
      {
        ok: false,
        error: `Scan failed: ${(err as Error).message}`,
      },
      { status: 502 },
    );
  }
}
