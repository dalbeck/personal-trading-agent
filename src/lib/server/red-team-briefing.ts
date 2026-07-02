import "server-only";

import { sleeveToStrategy, type Sleeve } from "@/lib/sleeves";
import type { Strategy } from "@/lib/strategy";
import type {
  CashFlowQuality,
  CatalystSource,
  CatalystState,
  DividendSignals,
  ResearchStatus,
} from "@/lib/types";
import type { RedTeamProposal } from "./red-team";

/**
 * The structural briefing source for the red-team prosecutor. Both a
 * `TradeProposal` and an (enriched) `ApprovalOrder` satisfy it, so every call
 * site can brief the prosecutor through the one shared {@link toRedTeamProposal}
 * mapper instead of building the object inline and silently dropping fields.
 *
 * Adding a field here (and to `RedTeamProposal`) without wiring it in
 * `toRedTeamProposal` is caught by `red-team-briefing.test.ts`.
 */
export interface RedTeamBriefingSource {
  symbol: string;
  action: "buy" | "sell";
  side: "long" | "short";
  qty: number;
  limitPrice: number;
  stopPrice: number | null;
  takeProfit: number | null;
  thesis: string;
  reasoning?: string;
  research?: string;
  /** Legacy mandate; used with `sleeve` to resolve the prosecutor's lens. */
  strategy?: Strategy | null;
  /** The sleeve; takes precedence over `strategy` when resolving the lens. */
  sleeve?: Sleeve | null;
  targetType?: string | null;
  relativeVolume?: number | null;
  catalyst?: string | null;
  catalystType?: string | null;
  sector?: string | null;
  catalystSources?: CatalystSource[] | null;
  catalystState?: CatalystState | null;
  targetWeightPct?: number | null;
  reviewTriggerPct?: number | null;
  /** Value-lens-only briefing (value-cashflow / dividend-floor / research
   *  unavailable). Passed to the prosecutor for the value lens only. */
  cashFlow?: CashFlowQuality | null;
  dividend?: DividendSignals | null;
  researchStatus?: ResearchStatus | null;
}

/** True when the briefing's lens is the value mandate. Mirrors the resolution in
 *  `buildProsecutorPrompt`: the sleeve wins over the legacy `strategy`. */
function isValueLens(src: RedTeamBriefingSource): boolean {
  const strategy = src.sleeve ? sleeveToStrategy(src.sleeve) : src.strategy;
  return strategy === "value";
}

/**
 * The single briefing mapper. Copies every prosecutor-relevant field and applies
 * the charter's lens separation: the value-only quality signals (`cashFlow`,
 * `dividend`, `researchStatus`) are briefed for the value lens ONLY — never
 * merged into a trend judgment. Used by the sweep, paper batch, re-run route,
 * approval fallback, and the ad-hoc red-team route so none of them drop the lens
 * or the value briefing.
 */
export function toRedTeamProposal(src: RedTeamBriefingSource): RedTeamProposal {
  const value = isValueLens(src);
  return {
    symbol: src.symbol,
    action: src.action,
    side: src.side,
    strategy: src.strategy ?? undefined,
    sleeve: src.sleeve ?? null,
    qty: src.qty,
    limitPrice: src.limitPrice,
    stopPrice: src.stopPrice,
    takeProfit: src.takeProfit,
    targetWeightPct: src.targetWeightPct ?? null,
    reviewTriggerPct: src.reviewTriggerPct ?? null,
    targetType: src.targetType ?? null,
    relativeVolume: src.relativeVolume ?? null,
    catalyst: src.catalyst ?? null,
    catalystType: src.catalystType ?? null,
    sector: src.sector ?? null,
    catalystSources: src.catalystSources ?? null,
    catalystState: src.catalystState ?? null,
    // Value lens only — never bleed value quality into a trend judgment.
    cashFlow: value ? src.cashFlow ?? null : null,
    dividend: value ? src.dividend ?? null : null,
    researchStatus: value ? src.researchStatus ?? null : null,
    thesis: src.thesis,
    reasoning: src.reasoning,
    research: src.research,
  };
}
