/**
 * Lens breakdowns for the proposal detail page (`/proposals/[id]`). A **manual**
 * analyze-a-symbol proposal is evaluated under BOTH the trend and value mandates
 * (dual-lens M1) and carries both breakdowns in `proposal.lenses`; the detail
 * page shows a glanceable dual-verdict summary + a Trend/Value toggle, and the
 * acting lens at approval drives the order.
 *
 * This derives the per-lens **view** (each breakdown + its checklist):
 * - dual-lens (manual) → one entry per `proposal.lenses` breakdown;
 * - single-lens (discovery, older records) → one entry synthesized from the
 *   top-level fields (which ARE the lone lens).
 *
 * The proposal's **top-level fields mirror the active lens**, so `resolveActiveLens`
 * picks the right breakdown for execution/approval. Plain module (no
 * `server-only`) so the client detail view + the approve routes both import it.
 */
import { buildChecklist, type CheckItem } from "@/lib/checklist";
import { SLEEVE_LABEL, sleeveOf, strategyToSleeve, type Sleeve } from "@/lib/sleeves";
import { STRATEGY_LABEL, type Strategy } from "@/lib/strategy";
import type { ProposalLensBreakdown, RedTeamVerdict, TradeProposal } from "@/lib/types";

/** A lens breakdown plus its derived pre-trade checklist (for the detail page). */
export interface ProposalLensView extends ProposalLensBreakdown {
  checklist: CheckItem[];
}

/** The sleeve a lens evaluates (verdict-matrix M7) — its explicit `sleeve`, or the
 *  sleeve derived from its `strategy` for older dual-lens records. */
export function lensSleeveOf(lens: {
  sleeve?: Sleeve | null;
  strategy: Strategy;
}): Sleeve {
  return lens.sleeve ?? strategyToSleeve(lens.strategy);
}

/** The lone lens for a single-lens proposal: its top-level fields verbatim. */
function singleLensFromTopLevel(p: TradeProposal): ProposalLensBreakdown {
  return {
    strategy: p.strategy,
    sleeve: p.sleeve,
    limitPrice: p.limitPrice,
    stopPrice: p.stopPrice,
    takeProfit: p.takeProfit,
    targetType: p.targetType,
    qty: p.qty,
    riskPct: p.riskPct,
    targetWeightPct: p.targetWeightPct,
    reviewTriggerPct: p.reviewTriggerPct,
    relativeVolume: p.relativeVolume,
    catalyst: p.catalyst,
    catalystType: p.catalystType,
    catalystSources: p.catalystSources,
    catalystState: p.catalystState,
    convictionScore: p.convictionScore,
    convictionTier: p.convictionTier,
    confidence: p.confidence,
    thesis: p.thesis,
    reasoning: p.reasoning,
    redTeam: p.redTeam,
    cashFlow: p.cashFlow,
    dividend: p.dividend,
    researchStatus: p.researchStatus,
    researchStatusReason: p.researchStatusReason,
    cashFlowSource: p.cashFlowSource,
    dividendSource: p.dividendSource,
  };
}

/** The proposal's lens breakdown(s) — `proposal.lenses` when dual, else the lone
 *  top-level lens. The source of truth for the detail page + the approve routes. */
export function proposalBreakdowns(p: TradeProposal): ProposalLensBreakdown[] {
  // `?? []` hardens against legacy/partial records lacking the field — the schema
  // defaults it to `[]`, but a hand-built object may omit it.
  const lenses = p.lenses ?? [];
  return lenses.length > 0 ? lenses : [singleLensFromTopLevel(p)];
}

/** Derive the lens view(s) for a proposal — each breakdown + its own checklist
 *  (built from that lens's levels/strategy, plus the proposal's action/side). */
export function buildProposalLenses(p: TradeProposal): ProposalLensView[] {
  // Each lens is scored under its OWN sleeve's checklist (verdict-matrix M7) —
  // explicit for a multi-sleeve analyze, derived from `strategy` for older
  // dual-lens (swing) records. Swing routes to the same trend/value checklist as
  // before, so swing output is unchanged.
  return proposalBreakdowns(p).map((b) => ({
    ...b,
    checklist: buildChecklist({
      action: p.action,
      side: p.side,
      // Sector drives the financial-sector leverage suppression (red-team-fixes
      // Issue 1) so the value-trap row matches the red team.
      sector: p.sector,
      ...b,
      // After `...b` so the lens's resolved sleeve (explicit or derived) wins.
      sleeve: lensSleeveOf(b),
    }),
  }));
}

/** The active lens breakdown for execution/approval. Picks the lens matching the
 *  requested sleeve (the human's toggled lens at approval) — a `trend`/`value`
 *  request maps to its swing sleeve for back-compat; falls back to the lens
 *  matching the proposal's own sleeve, then the first. */
export function resolveActiveLens(
  p: TradeProposal,
  wanted?: Sleeve | Strategy | null,
): ProposalLensBreakdown {
  const breakdowns = proposalBreakdowns(p);
  const wantedSleeve: Sleeve | null = wanted
    ? wanted === "trend" || wanted === "value"
      ? strategyToSleeve(wanted)
      : wanted
    : null;
  if (wantedSleeve) {
    const match = breakdowns.find((b) => lensSleeveOf(b) === wantedSleeve);
    if (match) return match;
  }
  const own = sleeveOf(p);
  return breakdowns.find((b) => lensSleeveOf(b) === own) ?? breakdowns[0];
}

/** True when a proposal carries more than one lens — drives the verdict matrix +
 *  the sleeve toggle. */
export function isDualLens(lenses: readonly unknown[]): boolean {
  return lenses.length > 1;
}

/** Glanceable dual-verdict summary, e.g. `Trend: reject · Value: concern`. A lens
 *  with no red-team verdict yet reads `not run`. */
export function dualVerdictSummary(
  lenses: readonly { strategy: Strategy; redTeam: RedTeamVerdict | null }[],
): string {
  return lenses
    .map(
      (l) => `${STRATEGY_LABEL[l.strategy]}: ${l.redTeam?.verdict ?? "not run"}`,
    )
    .join(" · ");
}

/** Glanceable multi-sleeve verdict summary (verdict-matrix M7), e.g.
 *  `Core ✓ · Position concern · Trend ✗`. Keyed on each lens's sleeve. */
export function multiVerdictSummary(
  lenses: readonly {
    sleeve?: Sleeve | null;
    strategy: Strategy;
    redTeam: RedTeamVerdict | null;
  }[],
): string {
  return lenses
    .map((l) => {
      const v = l.redTeam?.verdict;
      const mark = v === "approve" ? "✓" : v === "reject" ? "✗" : v ?? "not run";
      return `${SLEEVE_LABEL[lensSleeveOf(l)]} ${mark}`;
    })
    .join(" · ");
}
