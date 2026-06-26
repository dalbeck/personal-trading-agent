/**
 * Lens breakdown for the proposal detail page (`/proposals/[id]`). A proposal is
 * **judged under a strategy** (`trend` | `value`, value-sleeve M1); this derives
 * the per-lens view — the checklist + red-team verdict for each lens it carries.
 *
 * Today every proposal is **single-lens** (one `strategy` + one `redTeam`), so
 * this returns one entry. It is written **dual-lens-ready**: when the separate
 * dual-lens analyze feature attaches a second lens, this returns one entry per
 * lens and the detail page lights up the glanceable dual-verdict summary + the
 * Trend/Value toggle (both gated on `isDualLens`). No data-model change here —
 * presentation only.
 *
 * Plain module (no `server-only`) so the client detail view imports it directly.
 */
import { buildChecklist, type CheckItem } from "@/lib/checklist";
import { STRATEGY_LABEL, type Strategy } from "@/lib/strategy";
import type { RedTeamVerdict, TradeProposal } from "@/lib/types";

export interface ProposalLens {
  strategy: Strategy;
  redTeam: RedTeamVerdict | null;
  checklist: CheckItem[];
}

/** Derive the lens breakdown(s) for a proposal. Single-lens today; one entry per
 *  lens once dual-lens analyses exist. */
export function buildProposalLenses(p: TradeProposal): ProposalLens[] {
  return [
    {
      strategy: p.strategy,
      redTeam: p.redTeam,
      checklist: buildChecklist(p),
    },
  ];
}

/** True when a proposal carries more than one lens — drives the dual-verdict
 *  summary + the Trend/Value toggle. */
export function isDualLens(lenses: ProposalLens[]): boolean {
  return lenses.length > 1;
}

/** Glanceable dual-verdict summary, e.g. `Trend: reject · Value: concern`. A lens
 *  with no red-team verdict yet reads `not run`. */
export function dualVerdictSummary(lenses: ProposalLens[]): string {
  return lenses
    .map(
      (l) => `${STRATEGY_LABEL[l.strategy]}: ${l.redTeam?.verdict ?? "not run"}`,
    )
    .join(" · ");
}
