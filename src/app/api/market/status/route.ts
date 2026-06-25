import { getMarketStatusSnapshot } from "@/lib/server/market";

/**
 * Market-status for the header pill. Returns resolved open/closed state and the
 * next boundary instants (ISO) — the client computes the live countdown from
 * these locally. Sourced from Alpaca's calendar server-side (keys never reach
 * the client); degrades to a labeled regular-hours approximation without creds.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const snapshot = await getMarketStatusSnapshot();
  return Response.json(snapshot);
}
