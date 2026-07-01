import { z } from "zod";
import { requireAuthorized } from "@/lib/server/authorize";
import { getResearchProvider } from "@/lib/server/research";

/**
 * Research enrichment endpoint for the **pre-market research routine only**
 * (Phase 2 M8). Returns Perplexity `finance_search` context for one ticker, or
 * `{ result: null }` when research is off / capped / unavailable. The hard daily
 * cap is enforced inside the provider, in code. Research only — never used for
 * order pricing or execution. LOCAL; optionally token-gated.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[A-Z0-9.\-]+$/),
  question: z.string().trim().max(500).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const denied = requireAuthorized(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid request" }, { status: 400 });
  }

  const provider = getResearchProvider();
  const result = await provider.research(parsed.data);
  return Response.json({ provider: provider.name, result });
}
