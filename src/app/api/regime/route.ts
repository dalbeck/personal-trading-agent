import { getRegimeContext } from "@/lib/server/regime";

/**
 * Advisory market-regime context (M4) — SPY trend, VIX band, and sector
 * rotation. LOCAL, read-only; the pre-market routine curls this to include the
 * one-line context note in its output, and the dashboard renders the same read.
 * Fail-soft: always returns a renderable context, never an error page.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const regime = await getRegimeContext();
  return Response.json(regime);
}
