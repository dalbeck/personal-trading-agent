import { readRiskSettings, writeRiskSettings } from "@/lib/server/risk-settings";

/**
 * Risk-settings read/write (Phase 3 M7). The human configures or disables each
 * rail here; the overrides layer over the charter `RISK_LIMITS` at per-trade
 * approval time. A **local data-state mutation only** — no broker, no order, no
 * gate. It cannot open the live gate or place an order; it only relaxes (or
 * restores) the per-trade approval rails on the human's own account, validated
 * server-side against `RiskSettingsSchema`. Same pattern as `/api/watchlist`.
 *
 * LOCAL ONLY. Never expose this server publicly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ settings: await readRiskSettings() });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const settings = await writeRiskSettings(body);
    return Response.json({ settings });
  } catch (err) {
    return Response.json(
      { error: `invalid risk settings: ${(err as Error).message}` },
      { status: 400 },
    );
  }
}
