import { refreshLiveAccount } from "@/lib/server/account";

/**
 * Refresh the live Robinhood Agentic snapshot on demand (the Refresh button on
 * the LIVE panel, or a routine). This does the read-only `claude` CLI read of
 * the account, enriches positions with the current Alpaca price, and persists
 * the snapshot — so the (fast) page render can read it. It can NEVER place an
 * order: it only reads + saves.
 *
 * The read is slow (the CLI spawn takes tens of seconds), which is exactly why
 * it lives here and not on every page render.
 *
 * LOCAL ONLY. Never expose this server publicly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const live = await refreshLiveAccount();
  return Response.json({
    connected: live.connected,
    source: live.source,
    notice: live.notice,
    asOf: live.snapshot?.asOf ?? null,
    positions: live.snapshot?.positions.length ?? 0,
  });
}
