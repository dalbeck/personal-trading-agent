/**
 * Pure bounds for the autonomous-discovery routine (M3). The discovery run is
 * LLM-driven (a `claude -p` routine), but the caps it must respect live in code
 * (`DISCOVERY_LIMITS` in the charter) and are computed here so they are
 * unit-tested and unambiguous.
 *
 * Discovery output is always review-only — auto-generated proposals are
 * candidates for human review, never auto-acted — and watchlist auto-adds are
 * tracking-only (no order, no execution path).
 */

/** How many NEW proposals a discovery run may still emit for an account: the
 *  per-run cap minus what's already pending (so the queue can't exceed what a
 *  day could act on). Never negative. */
export function discoveryProposalBudget(
  pending: number,
  maxNewProposalsPerRun: number,
): number {
  return Math.max(0, maxNewProposalsPerRun - Math.max(0, pending));
}
