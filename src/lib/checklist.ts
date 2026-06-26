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
 *   target** (a `fundamental` target is appropriate here, not weak), and a
 *   **catalyst *or* floor** (why now). It deliberately **omits** the
 *   breakout-volume item — counter-trend is expected for value, so being below
 *   the moving averages is never itself a flag (quality / value-trap is judged
 *   by the value red-team lens, not a green-check from structured fields).
 *
 * Plain module (no `server-only`) so the client modal imports it directly.
 */
import { computeRiskReward, formatRatio } from "@/lib/risk-reward";
import { isWeakTarget, targetTypeLabel } from "@/lib/target-type";
import { isWeakCatalyst, catalystTypeLabel } from "@/lib/catalyst";
import { formatRelativeVolume, REL_VOLUME_BREAKOUT_MIN } from "@/lib/volume";
import { formatCurrency, formatPercent } from "@/lib/format";
import { RISK_LIMITS } from "@strategy/charter.config";
import type { TradeProposal } from "@/lib/types";

export type CheckStatus = "pass" | "flag" | "na";

export interface CheckItem {
  label: string;
  status: CheckStatus;
  detail: string;
}

/** Shared hard-rail + governance items both mandates clear identically. */
function rewardRiskItem(p: TradeProposal): CheckItem {
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

function riskCapItem(p: TradeProposal): CheckItem {
  return {
    label: `Risk ≤ ${formatPercent(RISK_LIMITS.perPositionRiskPct, {
      signed: false,
    })} of equity`,
    status: p.riskPct <= RISK_LIMITS.perPositionRiskPct ? "pass" : "flag",
    detail: formatPercent(p.riskPct, { signed: false }),
  };
}

function redTeamItem(p: TradeProposal): CheckItem {
  return {
    label: "Red-team not a reject",
    status: !p.redTeam ? "na" : p.redTeam.verdict === "reject" ? "flag" : "pass",
    detail: p.redTeam ? p.redTeam.verdict : "not run",
  };
}

function stopItem(p: TradeProposal, label: string): CheckItem {
  return {
    label,
    status: p.stopPrice === null ? "flag" : "pass",
    detail: p.stopPrice === null ? "none" : formatCurrency(p.stopPrice),
  };
}

function targetItem(p: TradeProposal, label: string): CheckItem {
  return {
    label,
    status:
      p.takeProfit === null || isWeakTarget(p.targetType) ? "flag" : "pass",
    detail: targetTypeLabel(p.targetType),
  };
}

function catalystItem(p: TradeProposal, label: string): CheckItem {
  return {
    label,
    status:
      p.catalyst === null || isWeakCatalyst(p.catalystType) ? "flag" : "pass",
    detail: catalystTypeLabel(p.catalystType),
  };
}

/** The trend mandate's checklist (the desk's original). */
function trendChecklist(p: TradeProposal): CheckItem[] {
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
function valueChecklist(p: TradeProposal): CheckItem[] {
  return [
    rewardRiskItem(p),
    riskCapItem(p),
    stopItem(p, "Mean-reversion stop below support"),
    targetItem(p, "Discount / target anchored"),
    catalystItem(p, "Catalyst or floor — why now"),
    redTeamItem(p),
  ];
}

/** Build the derived pre-trade checklist for a proposal, by its strategy. */
export function buildChecklist(p: TradeProposal): CheckItem[] {
  return p.strategy === "value" ? valueChecklist(p) : trendChecklist(p);
}
