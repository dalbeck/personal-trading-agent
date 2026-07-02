import { readProposals } from "@/lib/server/data";
import { requireAuthorized } from "@/lib/server/authorize";
import { parseRedTeamModel, runRedTeam } from "@/lib/server/red-team";
import { toRedTeamProposal } from "@/lib/server/red-team-briefing";
import { setProposalRedTeam } from "@/lib/server/writers";

/**
 * Re-run the red-team prosecutor for ONE proposal and overwrite its stored
 * verdict. Unlike the post-discovery sweep (which only judges proposals that
 * lack a verdict), this **always** re-judges — the user's deliberate action
 * after editing a thesis or wanting a second look. It **re-spends one prosecutor
 * call**, so the UI confirm-gates it.
 *
 * An optional `{ model: "codex" | "claude" }` body picks the prosecutor family
 * (red-team-model-toggle); absent/unrecognized → GPT (codex). This is the lever
 * for A/B-ing the same proposal under GPT vs Claude — the stored verdict records
 * which judge produced it.
 *
 * This only judges — it places nothing and touches no order path. LOCAL.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const denied = requireAuthorized(req);
  if (denied) return denied;
  const { id } = await params;

  // Optional model override; a malformed/absent body just keeps the GPT default.
  let model: ReturnType<typeof parseRedTeamModel> = parseRedTeamModel(undefined);
  try {
    const body = (await req.json()) as { model?: string };
    model = parseRedTeamModel(body?.model);
  } catch {
    // No/invalid JSON body — keep the default model.
  }

  const proposals = await readProposals();
  const proposal = proposals.find((p) => p.id === id);
  if (!proposal) {
    return Response.json({ error: "unknown proposal" }, { status: 404 });
  }

  // One shared briefing mapper (H3) — a RE-RUN judges on the FULL briefing
  // (sleeve + value cashFlow/dividend/researchStatus), so a value/core proposal
  // is re-judged under its own lens rather than the trend lens.
  const verdict = await runRedTeam(toRedTeamProposal(proposal), { model });

  const written = await setProposalRedTeam(id, verdict);
  if (!written) {
    return Response.json(
      { error: "could not persist the verdict" },
      { status: 500 },
    );
  }

  return Response.json({ verdict });
}
