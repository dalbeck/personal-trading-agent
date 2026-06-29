/**
 * The derived **pre-trade checklist** shown on a proposal's detail modal — a
 * pass/flag/na view of how well a proposal clears the playbook, computed purely
 * from its fields. Extracted from the modal so it is unit-testable and
 * **strategy-aware** (value-sleeve M1): the trend mandate and the value /
 * mean-reversion mandate are scored by **different** entry criteria.
 *
 * The thresholds come from the charter (`RISK_LIMITS`) and the documented signal
 * floors — never hardcoded policy. The **hard risk rails are shared** across both
 * mandates (reward/risk ≥ 2:1, ≤ 2% risk, a stop, red-team) — only the
 * entry-thesis items differ:
 *
 * - **Trend** — a protective stop, a technically-anchored target, a named
 *   catalyst, and **breakout/pullback volume confirmation**.
 * - **Value** — a **mean-reversion stop** below support, a **discount / anchored
 *   target** (a `fundamental` target is appropriate here, not weak), a
 *   **catalyst *or* floor** (why now), and **cash-flow quality** (the floor-vs-trap
 *   tell: durable positive FCF supports the floor, negative/declining FCF + rising
 *   leverage flags a trap). It deliberately **omits** the breakout-volume item —
 *   counter-trend is expected for value, so being below the moving averages is
 *   never itself a flag (broader quality / value-trap judgment is the value
 *   red-team lens, not a green-check from structured fields).
 *
 * Plain module (no `server-only`) so the client modal imports it directly.
 */
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import { isWeakTarget, targetTypeLabel } from "@/lib/target-type";
import { isWeakCatalyst, catalystTypeLabel } from "@/lib/catalyst";
import {
  CATALYST_NONE_DETAIL,
  CATALYST_UNAVAILABLE_DETAIL,
  resolveCatalystState,
} from "@/lib/catalyst-state";
import { assessCashFlowQuality } from "@/lib/cash-flow";
import {
  isResearchUnavailable,
  researchUnavailableLabel,
} from "@/lib/research-availability";
import { formatRelativeVolume, REL_VOLUME_BREAKOUT_MIN } from "@/lib/volume";
import { formatCurrency, formatPercent } from "@/lib/format";
import { RISK_LIMITS } from "@strategy/charter.config";
import { MAX_REVIEW_TRIGGER_PCT } from "@/lib/risk/validators";
import type { Strategy } from "@/lib/strategy";
import { sleeveToStrategy, type Sleeve } from "@/lib/sleeves";
import type { CatalystType } from "@/lib/catalyst";
import type { TargetType } from "@/lib/target-type";
import type {
  CashFlowQuality,
  CatalystState,
  RedTeamVerdict,
  ResearchStatus,
} from "@/lib/types";

export type CheckStatus = "pass" | "flag" | "na";

export interface CheckItem {
  label: string;
  status: CheckStatus;
  detail: string;
}

/**
 * The minimal field set the checklist reads — a `TradeProposal` satisfies it
 * structurally, and so does a per-lens breakdown merged with the proposal's
 * action/side (so a dual-lens proposal can build a checklist per lens).
 */
export interface ChecklistInput {
  action: "buy" | "sell";
  side?: "long" | "short";
  strategy: Strategy;
  /** Core-long (target-weight) sizing context (core-long M3) — drives the
   *  allocation-fit + review-trigger checklist items. Null/absent for swing/mid. */
  targetWeightPct?: number | null;
  reviewTriggerPct?: number | null;
  /** The sleeve this checklist is built for (sleeve-framework M1). When set it
   *  takes precedence over `strategy` to pick the checklist; the two swing
   *  sleeves resolve to the same trend/value branch as `strategy`, so swing
   *  output is unchanged. Optional so existing callers (which pass `strategy`)
   *  are untouched. */
  sleeve?: Sleeve | null;
  limitPrice: number;
  stopPrice: number | null;
  takeProfit: number | null;
  targetType: TargetType | null;
  riskPct: number;
  catalyst: string | null;
  catalystType: CatalystType | null;
  /** The catalyst capture state (catalyst-state-honesty M2) — distinguishes
   *  "searched, none found" from "fetch failed" so the checklist never reads a
   *  failure as a flat "no catalyst". Null → derived from catalyst presence. */
  catalystState?: CatalystState | null;
  relativeVolume: number | null;
  /** Cash-flow quality — the value lens's floor-vs-trap signal (value-cashflow
   *  M1). Value mandate only; null/absent for trend lenses. */
  cashFlow?: CashFlowQuality | null;
  /** GICS sector. For Finance-sector names the cash-flow item suppresses the
   *  generic leverage/coverage value-trap factors (red-team-fixes Issue 1) —
   *  they are category errors for deposit-funded businesses. Null when unknown. */
  sector?: string | null;
  /** Research availability (research-unavailable-state M3). When off/capped/failed
   *  the cash-flow item reads "Data unavailable" instead of a silent "—". */
  researchStatus?: ResearchStatus | null;
  redTeam: RedTeamVerdict | null;
}

/** Shared hard-rail + governance items both mandates clear identically. */
function rewardRiskItem(p: ChecklistInput): CheckItem {
  const rr = computeRiskReward({
    action: p.action,
    entry: p.limitPrice,
    stop: p.stopPrice,
    target: p.takeProfit,
  });
  return {
    label: "Reward : risk ≥ 2 : 1",
    status: rr ? (rr.ratio >= 2 ? "pass" : "flag") : "na",
    detail: rr ? formatRatio(rr.ratio) : "no defined target",
  };
}

function riskCapItem(p: ChecklistInput): CheckItem {
  return {
    label: `Risk ≤ ${formatPercent(RISK_LIMITS.perPositionRiskPct, {
      signed: false,
    })} of equity`,
    status: p.riskPct <= RISK_LIMITS.perPositionRiskPct ? "pass" : "flag",
    detail: formatPercent(p.riskPct, { signed: false }),
  };
}

function redTeamItem(p: ChecklistInput): CheckItem {
  return {
    label: "Red-team not a reject",
    status: !p.redTeam ? "na" : p.redTeam.verdict === "reject" ? "flag" : "pass",
    detail: p.redTeam ? p.redTeam.verdict : "not run",
  };
}

function stopItem(p: ChecklistInput, label: string): CheckItem {
  return {
    label,
    status: p.stopPrice === null ? "flag" : "pass",
    detail: p.stopPrice === null ? "none" : formatCurrency(p.stopPrice),
  };
}

function targetItem(p: ChecklistInput, label: string): CheckItem {
  return {
    label,
    status:
      p.takeProfit === null || isWeakTarget(p.targetType) ? "flag" : "pass",
    detail: targetTypeLabel(p.targetType),
  };
}

/**
 * Catalyst checklist item with the THREE distinct states (catalyst-state-honesty
 * M2), never conflated: **found** → ✓ (the catalyst type); **none** (searched,
 * nothing material) → ⚑ "No catalyst found"; **unavailable** (the fetch failed) →
 * ⚑ "Data unavailable — retry" — NOT a flat "no catalyst". A weak/`none` catalyst
 * type on an otherwise "found" record still flags (back-compat).
 */
function catalystItem(p: ChecklistInput, label: string): CheckItem {
  const state = resolveCatalystState({
    catalyst: p.catalyst,
    catalystState: p.catalystState,
  });
  if (state === "unavailable") {
    return { label, status: "flag", detail: CATALYST_UNAVAILABLE_DETAIL };
  }
  if (state === "none") {
    return { label, status: "flag", detail: CATALYST_NONE_DETAIL };
  }
  return {
    label,
    status:
      p.catalyst === null || isWeakCatalyst(p.catalystType) ? "flag" : "pass",
    detail: catalystTypeLabel(p.catalystType),
  };
}

/**
 * The value lens's cash-flow quality item (value-cashflow M1) — the floor-vs-trap
 * discriminator. **Pass** on durable, positive FCF with a healthy yield + manageable
 * leverage; **flag** on negative/declining FCF or rising leverage; **na** when
 * there's no usable cash-flow data. The pass/flag logic is the pure
 * `assessCashFlowQuality`.
 *
 * research-unavailable-state M3: when the data is absent BECAUSE the research was
 * off/capped/failed, the detail reads an explicit **"Data unavailable (reason)"**
 * instead of a silent "—" that reads like "verified, nothing there".
 */
function cashFlowItem(p: ChecklistInput): CheckItem {
  const { status, detail } = assessCashFlowQuality(p.cashFlow ?? null, {
    sector: p.sector,
  });
  if (status === "na" && isResearchUnavailable(p.researchStatus)) {
    const reason = researchUnavailableLabel(p.researchStatus);
    return {
      label: "Cash-flow quality",
      status: "na",
      detail: reason ? `Data unavailable · ${reason}` : "Data unavailable",
    };
  }
  return { label: "Cash-flow quality", status, detail };
}

/** The trend mandate's checklist (the desk's original). */
function trendChecklist(p: ChecklistInput): CheckItem[] {
  return [
    rewardRiskItem(p),
    riskCapItem(p),
    stopItem(p, "Protective stop defined"),
    targetItem(p, "Profit target anchored"),
    catalystItem(p, "Catalyst — why now"),
    {
      label: "Volume confirms",
      status:
        p.relativeVolume == null
          ? "na"
          : p.relativeVolume >= REL_VOLUME_BREAKOUT_MIN
            ? "pass"
            : "flag",
      detail:
        p.relativeVolume == null ? "—" : formatRelativeVolume(p.relativeVolume),
    },
    redTeamItem(p),
  ];
}

/**
 * The value / mean-reversion mandate's checklist. Shares the hard rails, but
 * reframes the entry items for a value lens and **drops the breakout-volume
 * item** — counter-trend is expected, so below-MA is never itself a flag. A
 * `fundamental` target is a pass here (it isn't `analyst_price`/missing). Quality
 * vs the value-trap is judged by the value red-team lens, not a structured field.
 */
function valueChecklist(p: ChecklistInput): CheckItem[] {
  return [
    rewardRiskItem(p),
    riskCapItem(p),
    stopItem(p, "Mean-reversion stop below support"),
    targetItem(p, "Discount / target anchored"),
    catalystItem(p, "Catalyst or floor — why now"),
    cashFlowItem(p),
    redTeamItem(p),
  ];
}

/** Core-long allocation-fit item — the position is sized to a **target portfolio
 *  weight**, so the check is "is a sane target weight set?" rather than a stop. */
function allocationFitItem(p: ChecklistInput): CheckItem {
  const w = p.targetWeightPct;
  return {
    label: "Target weight & allocation fit",
    status: w != null && w > 0 ? "pass" : "flag",
    detail: w != null ? formatPercent(w, { signed: false }) : "no target weight",
  };
}

/** Core-long valuation item — judged on whether the entry is anchored to
 *  long-term **value** (a fundamental/valuation anchor passes). A core ETF/index
 *  with no price target reads **na** ("judged by red-team"), never a flag — a
 *  buy-and-hold index legitimately has no near-term price target. */
function coreValuationItem(p: ChecklistInput): CheckItem {
  if (p.targetType == null) {
    return {
      label: "Valuation vs long-term value",
      status: "na",
      detail: "judged by red-team",
    };
  }
  return {
    label: "Valuation vs long-term value",
    status: isWeakTarget(p.targetType) ? "flag" : "pass",
    detail: targetTypeLabel(p.targetType),
  };
}

/** Core-long quality item — a durable business (positive, well-covered FCF) or a
 *  low-cost diversified fund. Reuses the cash-flow assessment; a fund with no
 *  cash-flow data reads **na** (its expense ratio / structure is prosecuted by the
 *  core-long red-team, not a structured green-check). */
function coreQualityItem(p: ChecklistInput): CheckItem {
  const { status, detail } = assessCashFlowQuality(p.cashFlow ?? null, {
    sector: p.sector,
  });
  if (status === "na" && isResearchUnavailable(p.researchStatus)) {
    const reason = researchUnavailableLabel(p.researchStatus);
    return {
      label: "Quality — business or fund",
      status: "na",
      detail: reason ? `Data unavailable · ${reason}` : "Data unavailable",
    };
  }
  return { label: "Quality — business or fund", status, detail };
}

/** Core-long review-trigger item — the wide drawdown/**review trigger** that
 *  stands in for a protective stop. Pass when a sane trigger is set
 *  (`0 < pct ≤ MAX_REVIEW_TRIGGER_PCT`). */
function reviewTriggerItem(p: ChecklistInput): CheckItem {
  const t = p.reviewTriggerPct;
  const ok = t != null && t > 0 && t <= MAX_REVIEW_TRIGGER_PCT;
  return {
    label: "Drawdown / review trigger",
    status: ok ? "pass" : "flag",
    detail: t != null ? formatPercent(t, { signed: false }) : "none",
  };
}

/**
 * The long-term / core mandate's checklist (core-long M3). A buy-and-hold book:
 * it leads on **allocation fit, valuation vs long-term value, and quality**, with
 * a **drawdown/review trigger** in place of a stop. It deliberately **drops** the
 * breakout-volume and catalyst-timing items (counter-trend and "no near-term
 * catalyst" are normal here, not strikes — the value-sleeve precedent), and has
 * no risk-to-stop reward:risk item (there is no stop). Overpaying, thesis drift,
 * over-concentration, and fund quality are prosecuted by the core-long red-team.
 */
function coreLongChecklist(p: ChecklistInput): CheckItem[] {
  return [
    allocationFitItem(p),
    coreValuationItem(p),
    coreQualityItem(p),
    reviewTriggerItem(p),
    redTeamItem(p),
  ];
}

/**
 * The mid-term / position mandate's checklist (position-mid M4). A weeks–quarters
 * position trade that blends trend with fundamentals: it **still requires a stop**
 * (a wider band than swing) and a reward:risk, but a **named fundamental thesis is
 * allowed to lead** (a fundamental target is appropriate, not weak) and it **drops
 * the breakout-volume item** — a mid entry isn't a momentum chase. An earnings
 * event inside the holding window is tolerated rather than auto-disqualifying;
 * that tolerance is judged by the position-mid red-team, not a structured field.
 */
function positionMidChecklist(p: ChecklistInput): CheckItem[] {
  return [
    rewardRiskItem(p),
    riskCapItem(p),
    stopItem(p, "Protective stop — wider band"),
    targetItem(p, "Target — multi-week / fundamental"),
    catalystItem(p, "Catalyst or thesis — why this quarter"),
    redTeamItem(p),
  ];
}

/** Build the derived pre-trade checklist for a proposal, by its sleeve (falling
 *  back to `strategy`). The two swing sleeves resolve to the same trend/value
 *  branch the bare `strategy` would, so swing checklists are byte-identical;
 *  `core-long` and `position-mid` get their own checklists. */
export function buildChecklist(p: ChecklistInput): CheckItem[] {
  if (p.sleeve === "core-long") return coreLongChecklist(p);
  if (p.sleeve === "position-mid") return positionMidChecklist(p);
  const strategy = p.sleeve ? sleeveToStrategy(p.sleeve) : p.strategy;
  return strategy === "value" ? valueChecklist(p) : trendChecklist(p);
}
