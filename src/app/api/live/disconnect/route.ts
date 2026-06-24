import {
  clearDisconnect,
  disconnectLive,
  getLiveTradingStatus,
} from "@/lib/server/gate";

/**
 * One-click **disconnect** (halt) for live trading, plus an explicit clear.
 *
 * Disconnect is the *safe* direction — it can only latch live trading OFF, never
 * arm it — so it is unauthenticated beyond being localhost-only: anyone who can
 * reach the dashboard should be able to slam the brakes.
 *
 * Clearing the halt cannot bypass the two gates (live stays OFF unless a human
 * has opened both), but it is the slightly-less-safe direction, so it requires
 * the `ROUTINE_TRIGGER_TOKEN` bearer when that token is configured.
 *
 * LOCAL ONLY. Never expose this server publicly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let action = "disconnect";
  try {
    const body = (await req.json()) as { action?: string };
    if (body?.action) action = body.action;
  } catch {
    /* no body → default disconnect */
  }

  if (action === "reconnect") {
    const token = process.env.ROUTINE_TRIGGER_TOKEN;
    if (token && req.headers.get("authorization") !== `Bearer ${token}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    await clearDisconnect();
  } else {
    await disconnectLive({ reason: "dashboard disconnect" });
  }

  const status = await getLiveTradingStatus();
  return Response.json(status);
}
