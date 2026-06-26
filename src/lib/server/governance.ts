import "server-only";

import {
  buildGovernanceScorecard,
  type GovernanceScorecard,
} from "@/lib/eval/governance";
import { readJournal, readProposals } from "./data";

/**
 * Resolve the {@link GovernanceScorecard} from `data/` — the decision journal
 * (rejections + placed trades) and the proposals (their red-team verdicts).
 * Thin IO wrapper around the pure {@link buildGovernanceScorecard}; the readers
 * are injectable so the page/tests stay hermetic.
 *
 * **Account-scoped (default `paper`).** The scorecard grades one book's gate;
 * mixing in the other book's trades, rejections, and red-team verdicts would
 * contaminate it (the "no paper/live bleed" invariant). Journal and proposals
 * are filtered to `account` before the pure math runs.
 */
export async function getGovernanceScorecard(opts?: {
  account?: "paper" | "live";
  readJournalImpl?: typeof readJournal;
  readProposalsImpl?: typeof readProposals;
}): Promise<GovernanceScorecard> {
  const account = opts?.account ?? "paper";
  const [allJournal, allProposals] = await Promise.all([
    (opts?.readJournalImpl ?? readJournal)(),
    (opts?.readProposalsImpl ?? readProposals)(),
  ]);
  const journal = allJournal.filter((e) => e.account === account);
  const proposals = allProposals.filter((p) => p.account === account);

  const rejections = journal
    .filter((e) => e.kind === "rejection")
    .map((e) => ({
      rejectedBy: e.rejectedBy,
      tags: e.tags ?? [],
    }));
  const tradesPlaced = journal.filter((e) => e.kind === "trade").length;

  return buildGovernanceScorecard({
    proposals: proposals.map((p) => ({ redTeam: p.redTeam })),
    rejections,
    tradesPlaced,
  });
}
