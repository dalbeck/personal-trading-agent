import "server-only";

import type { TradeProposal } from "@/lib/types";
import { readProposals } from "./data";
import { runRedTeam, type RedTeamExec } from "./red-team";
import { isVerdictFresh, toRedTeamProposal } from "./red-team-briefing";
import { setProposalRedTeam } from "./writers";

/**
 * Run the cross-model red-team on every **pending** proposal that lacks a
 * verdict, and attach the result — so the human sees the prosecutor's
 * decision **at review**. This is **code-driven** (deterministic), not left to
 * the discovery LLM to remember to call: the discovery routine just writes the
 * proposals, and this sweep runs right after (and on demand). Each `codex` call
 * is ~10s; the red-team fails closed to a "reject", so the verdict is never
 * silently favorable. This only judges — it places nothing.
 */
export interface SweepResult {
  /** Pending proposals that lacked a verdict (and were judged). */
  considered: number;
  /** Verdicts successfully written. */
  swept: number;
}

export async function sweepPendingRedTeam(opts?: {
  /** Red-team prosecutor seam (tests inject; default spawns codex). */
  exec?: RedTeamExec;
  /** Proposal source (tests inject; default reads the pending queue). */
  proposals?: TradeProposal[];
  /** Verdict writer (tests inject; default updates the proposal file). */
  setVerdict?: typeof setProposalRedTeam;
  dataDir?: string;
  /** Clock for the verdict-freshness check + stamp (tests pin it; default now). */
  now?: string;
}): Promise<SweepResult> {
  const pending =
    opts?.proposals ?? (await readProposals({ pendingOnly: true }));
  const setVerdict = opts?.setVerdict ?? setProposalRedTeam;

  let considered = 0;
  let swept = 0;
  for (const p of pending) {
    // One shared briefing mapper (H3) — carries the sleeve + the value briefing
    // (cashFlow/dividend/researchStatus) so a value/core proposal is judged under
    // its own lens, not spuriously rejected under the trend lens.
    const briefing = toRedTeamProposal(p);
    // Verdict invalidation (H4): skip only when the stored verdict is still FRESH
    // for the current briefing; a stale (changed/expired) verdict is re-judged so
    // the human reviews a current verdict, not a stale one.
    if (p.redTeam && isVerdictFresh(p.redTeam, briefing, { now: opts?.now })) {
      continue;
    }
    considered += 1;
    const verdict = await runRedTeam(briefing, { exec: opts?.exec, now: opts?.now });
    const ok = await setVerdict(p.id, verdict, { dataDir: opts?.dataDir })
      .then(() => true)
      .catch(() => false);
    if (ok) swept += 1;
  }
  return { considered, swept };
}
