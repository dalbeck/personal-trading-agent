import {
  readDiscoverySettings,
  writeDiscoverySettings,
} from "@/lib/server/discovery-settings";

/**
 * Discovery-funnel settings read/write (Phase 3 M3). The human tunes the review
 * funnel here — idea cap, per-sector cap, sector-spread target, and the minimum
 * conviction tier the queue surfaces. These are **preferences, not safety
 * rails**: a **local data-state mutation only** (no broker, no order, no gate),
 * bounded by the charter `DISCOVERY_LIMITS` ceilings server-side. The hard risk
 * rails and the 6-order/day cap are NOT settable here. Same pattern as
 * `/api/risk-settings`.
 *
 * LOCAL ONLY. Never expose this server publicly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ settings: await readDiscoverySettings() });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const settings = await writeDiscoverySettings(body);
    return Response.json({ settings });
  } catch (err) {
    return Response.json(
      { error: `invalid discovery settings: ${(err as Error).message}` },
      { status: 400 },
    );
  }
}
