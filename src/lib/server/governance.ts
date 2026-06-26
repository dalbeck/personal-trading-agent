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
 */
export async function getGovernanceScorecard(opts?: {
  readJournalImpl?: typeof readJournal;
  readProposalsImpl?: typeof readProposals;
}): Promise<GovernanceScorecard> {
  const [journal, proposals] = await Promise.all([
    (opts?.readJournalImpl ?? readJournal)(),
    (opts?.readProposalsImpl ?? readProposals)(),
  ]);

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
