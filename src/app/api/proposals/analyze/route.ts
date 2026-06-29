import { analyzeSymbol } from "@/lib/server/analyze-symbol";
import { getViewMode } from "@/lib/server/mode";

/**
 * On-demand "analyze a symbol" route (Phase 3 M2). Runs the full pipeline —
 * research → proposal → risk rails → red-team — for a human-entered ticker and
 * writes the result as a review candidate tagged `manual-request`. It is
 * **user-initiated and bounded**: it places nothing, the proposal still flows
 * the normal gated approval path, and a weak pick is flagged by the red-team
 * (never rubber-stamped). The book (paper / live) follows the current view mode.
 *
 * LOCAL only. No execution happens here — the proposal is queued for review.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let body: {
    symbol?: string;
    sleeve?: string;
    targetWeightPct?: number;
    reviewTriggerPct?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const symbol = body.symbol?.trim();
  if (!symbol) {
    return Response.json({ error: "symbol is required" }, { status: 400 });
  }

  // Sleeve picker (core-long M3): `core-long` analyzes a single target-weight,
  // no-stop core position; omitted/`swing-*` runs the dual-lens (trend + value)
  // path, unchanged. A target weight is required for the core path.
  const isCore = body.sleeve === "core-long";
  if (
    isCore &&
    !(typeof body.targetWeightPct === "number" && body.targetWeightPct > 0)
  ) {
    return Response.json(
      {
        error:
          "targetWeightPct (a positive fraction) is required for a core-long analyze",
      },
      { status: 400 },
    );
  }

  const account = await getViewMode(); // "paper" | "live"
  const result = await analyzeSymbol(symbol, {
    account,
    ...(isCore
      ? {
          sleeve: "core-long" as const,
          targetWeightPct: body.targetWeightPct,
          reviewTriggerPct: body.reviewTriggerPct,
        }
      : {}),
  });

  if (!result.ok) {
    const status =
      result.code === "invalid-symbol"
        ? 400
        : result.code === "no-snapshot"
          ? 409
          : 422;
    return Response.json(
      { ok: false, code: result.code, error: result.error },
      { status },
    );
  }

  return Response.json({
    ok: true,
    proposalId: result.proposal.id,
    symbol: result.proposal.symbol,
    account: result.proposal.account,
    // Both lens verdicts at a glance (dual-lens M1): [{ strategy, verdict }, …].
    lenses: result.proposal.lenses.map((l) => ({
      strategy: l.strategy,
      verdict: l.redTeam?.verdict ?? null,
    })),
    railsOk: result.risk.ok,
    railViolations: result.risk.violations.map((v) => ({
      rule: v.rule,
      message: v.message,
    })),
    usedPerplexity: result.usedPerplexity,
  });
}
