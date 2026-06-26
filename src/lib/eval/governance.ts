/**
 * Governance scorecard (pre-live polish M4) — evidence on whether the desk's
 * governance (the cross-model red-team + the hard risk rails) is actually doing
 * work, not just adding ceremony. Pure math over the decision journal +
 * proposals so it is unit-tested without IO.
 *
 * **Advisory + honest about its limits.** Red-team *rejected* ideas are never
 * placed, so their counterfactual P&L is unobservable — the scorecard reports
 * the gate's **selectivity** (how often it says no) and **per-rule rejection
 * counts**, not a clairvoyant "the reject would have lost". Small samples are
 * flagged so a handful of trades is never read as a verdict.
 */

export type RedTeamVerdictKind = "approve" | "reject" | "concern";
export type RejectedBy = "codex-redteam" | "rules" | "human";

export interface GovernanceInput {
  /** All proposals (any status); those with a stored red-team verdict count. */
  proposals: { redTeam: { verdict: RedTeamVerdictKind } | null }[];
  /** Rejection journal entries (the blocking actor + tags carrying `rule:<id>`). */
  rejections: { rejectedBy: RejectedBy; tags: string[] }[];
  /** Placed trades over the window, for context (denominator framing). */
  tradesPlaced: number;
}

export interface RuleCount {
  rule: string;
  count: number;
}

export interface GovernanceScorecard {
  /** Proposals that carried a red-team verdict. */
  judged: number;
  redTeam: {
    approve: number;
    concern: number;
    reject: number;
    /** Fractions of `judged`; null when nothing was judged. */
    approveRate: number | null;
    rejectRate: number | null;
  };
  rejections: {
    total: number;
    byActor: { redTeam: number; rules: number; human: number };
    /** Per-rule rejection counts, descending. Populated from `rule:<id>` tags. */
    byRule: RuleCount[];
  };
  tradesPlaced: number;
  /** Governance decisions observed (judged proposals + rejections). */
  sampleSize: number;
  /** True when the sample is too small to read as a verdict. */
  lowSample: boolean;
}

/** Below this many observed governance decisions, the scorecard is caveated. */
export const GOVERNANCE_LOW_SAMPLE = 20;

export function buildGovernanceScorecard(
  input: GovernanceInput,
): GovernanceScorecard {
  const judgedProposals = input.proposals.filter(
    (p): p is { redTeam: { verdict: RedTeamVerdictKind } } => p.redTeam != null,
  );
  const verdictCount = (k: RedTeamVerdictKind) =>
    judgedProposals.filter((p) => p.redTeam.verdict === k).length;
  const judged = judgedProposals.length;
  const approve = verdictCount("approve");
  const concern = verdictCount("concern");
  const reject = verdictCount("reject");

  const byActor = { redTeam: 0, rules: 0, human: 0 };
  const ruleMap = new Map<string, number>();
  for (const r of input.rejections) {
    if (r.rejectedBy === "codex-redteam") byActor.redTeam += 1;
    else if (r.rejectedBy === "rules") byActor.rules += 1;
    else byActor.human += 1;
    for (const tag of r.tags) {
      if (tag.startsWith("rule:")) {
        const rule = tag.slice("rule:".length);
        if (rule) ruleMap.set(rule, (ruleMap.get(rule) ?? 0) + 1);
      }
    }
  }
  const byRule = [...ruleMap.entries()]
    .map(([rule, count]) => ({ rule, count }))
    // Descending count, then stable by rule name.
    .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule));

  const sampleSize = judged + input.rejections.length;

  return {
    judged,
    redTeam: {
      approve,
      concern,
      reject,
      approveRate: judged > 0 ? approve / judged : null,
      rejectRate: judged > 0 ? reject / judged : null,
    },
    rejections: { total: input.rejections.length, byActor, byRule },
    tradesPlaced: input.tradesPlaced,
    sampleSize,
    lowSample: sampleSize < GOVERNANCE_LOW_SAMPLE,
  };
}
