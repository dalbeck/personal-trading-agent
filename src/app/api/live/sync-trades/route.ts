import { syncLiveTrades } from "@/lib/server/live-trades";

/**
 * Ingest the human's manual live trades from Robinhood order history (read-only)
 * into the decision journal so Coaching can review them (M2). Like the live
 * refresh, this does a slow read-only `claude` CLI read and writes journal
 * entries — it can NEVER place an order. Idempotent: only genuinely new fills
 * are journaled.
 *
 * LOCAL ONLY. Never expose this server publicly.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const result = await syncLiveTrades();
  return Response.json(result);
}
