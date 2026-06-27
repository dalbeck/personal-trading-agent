import "server-only";

import type { TradeProposal } from "@/lib/types";
import { readProposals } from "./data";
import { runRedTeam, type RedTeamExec } from "./red-team";
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
}): Promise<SweepResult> {
  const pending =
    opts?.proposals ?? (await readProposals({ pendingOnly: true }));
  const setVerdict = opts?.setVerdict ?? setProposalRedTeam;

  let considered = 0;
  let swept = 0;
  for (const p of pending) {
    if (p.redTeam) continue; // already judged
    considered += 1;
    const verdict = await runRedTeam(
      {
        symbol: p.symbol,
        action: p.action,
        side: p.side,
        strategy: p.strategy,
        qty: p.qty,
        limitPrice: p.limitPrice,
        stopPrice: p.stopPrice,
        takeProfit: p.takeProfit,
        targetType: p.targetType,
        relativeVolume: p.relativeVolume,
        catalyst: p.catalyst,
        catalystType: p.catalystType,
        // Carry the catalyst sources (catalyst-news-sources M1) + capture state
        // (catalyst-state-honesty M2) so the sweep judges on the full briefing and
        // never rejects an `unavailable` (failed-fetch) catalyst as "no catalyst".
        catalystSources: p.catalystSources,
        catalystState: p.catalystState,
        thesis: p.thesis,
        reasoning: p.reasoning,
      },
      { exec: opts?.exec },
    );
    const ok = await setVerdict(p.id, verdict, { dataDir: opts?.dataDir })
      .then(() => true)
      .catch(() => false);
    if (ok) swept += 1;
  }
  return { considered, swept };
}
