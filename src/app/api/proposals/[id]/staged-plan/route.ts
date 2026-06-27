import { readProposalById, setStagedPlan } from "@/lib/server/writers";
import { isAdvisoryProposal } from "@/lib/proposal-advisory";
import { buildStagedEntryPlan, STAGED_ENTRY_DEFAULTS } from "@/lib/staged-entry";

/**
 * Attach or remove a proposal's **staged-entry (DCA / scale-in) plan**
 * (staged-entry-plan M2). The plan splits the proposal's full intended position
 * into tranches the human approves one at a time through the normal gated
 * approval — this route only shapes the *suggested* schedule; it places nothing
 * and never auto-executes.
 *
 * Body: `{ remove: true }` clears the plan; otherwise `{ trancheCount?,
 * intervalDays?, driftBandPct? }` builds one off the proposal's full quantity
 * (defaults from `STAGED_ENTRY_DEFAULTS`). LOCAL, no order path.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof value === "number" ? Math.floor(value) : NaN;
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  let body: {
    remove?: boolean;
    trancheCount?: number;
    intervalDays?: number;
    driftBandPct?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const proposal = await readProposalById(id);
  if (!proposal) {
    return Response.json({ error: "unknown proposal" }, { status: 404 });
  }

  if (body.remove) {
    const updated = await setStagedPlan(id, null);
    return Response.json({ ok: true, stagedPlan: updated?.stagedPlan ?? null });
  }

  // Staged entry is for an executable proposal — advisory guidance has no order
  // path, so a tranche schedule would be meaningless there.
  if (isAdvisoryProposal(proposal)) {
    return Response.json(
      { error: "advisory proposal has no execution path to stage" },
      { status: 422 },
    );
  }

  // Clamp the human's params to sane bounds; the plan splits the proposal's full
  // (active-lens) quantity, so risk stays sized on the full position.
  const plan = buildStagedEntryPlan({
    fullQty: proposal.qty,
    trancheCount: clampInt(body.trancheCount, 1, 6, STAGED_ENTRY_DEFAULTS.trancheCount),
    intervalDays: clampInt(body.intervalDays, 0, 90, STAGED_ENTRY_DEFAULTS.intervalDays),
    driftBandPct:
      typeof body.driftBandPct === "number" && body.driftBandPct > 0
        ? Math.min(0.5, body.driftBandPct)
        : STAGED_ENTRY_DEFAULTS.driftBandPct,
  });
  if (!plan) {
    return Response.json(
      { error: "could not build a staged plan for this quantity" },
      { status: 422 },
    );
  }
  const updated = await setStagedPlan(id, plan);
  if (!updated) {
    return Response.json({ error: "could not persist the plan" }, { status: 500 });
  }
  return Response.json({ ok: true, stagedPlan: updated.stagedPlan });
}
