import { formatCurrency, formatPercent } from "./format";

/**
 * Pure risk/reward geometry for a trade proposal — the math behind the R:R bar
 * on every proposal card. Client-safe (no `server-only`): the card renders this
 * on both the Overview "Awaiting review" module and the full Proposals view.
 *
 * Everything here is a side-effect-free function so the proportions and ratio
 * can be unit-tested in isolation (`risk-reward.test.ts`).
 */

export type TradeAction = "buy" | "sell";

/** The charter's minimum reward-to-risk — a shared red-team hard rail (a thinner
 *  reward/risk is a strike). The single source of truth for the proposal builder,
 *  the red-team prompt, and the Strategy page's Red Team rules view. */
export const MIN_REWARD_RISK = 2;

export interface RiskRewardInput {
  action: TradeAction;
  /** Entry price (the proposal's marketable-limit price). */
  entry: number;
  /** Protective stop, or `null` when the proposal defines none. */
  stop: number | null;
  /** Profit target, or `null` when the proposal defines none. */
  target: number | null;
}

export interface RiskReward {
  /** Price distance from entry to stop (positive magnitude). */
  risk: number;
  /** Price distance from entry to target (positive magnitude). */
  reward: number;
  /** Reward-to-risk ratio, `reward / risk` (> 0). */
  ratio: number;
  /** Risk-zone width as a fraction of the bar, in (0, 1). */
  riskFraction: number;
  /** Reward-zone width as a fraction of the bar; `riskFraction + rewardFraction === 1`. */
  rewardFraction: number;
  /** Signed stop distance as a fraction of entry (buy: negative, sell: positive). */
  stopPctFromEntry: number;
  /** Signed target distance as a fraction of entry (buy: positive, sell: negative). */
  targetPctFromEntry: number;
}

/**
 * Resolve the bar geometry, or `null` when there's nothing valid to draw.
 *
 * Direction matters: for a BUY (long) the stop sits below entry and the target
 * above, so risk = entry − stop and reward = target − entry. For a SELL (short)
 * it's mirrored — stop above, target below — so both legs flip sign. We fold
 * that into a single `dir` multiplier and then *require* both legs to come out
 * positive; a stop/target on the wrong side (or exactly at entry, or missing,
 * or non-finite) yields `null` so the card degrades to "no defined target"
 * instead of rendering a broken or zero-width bar.
 */
export function computeRiskReward({
  action,
  entry,
  stop,
  target,
}: RiskRewardInput): RiskReward | null {
  if (stop === null || target === null) return null;
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(target)) {
    return null;
  }
  if (entry === 0) return null;

  const dir = action === "buy" ? 1 : -1;
  const risk = dir * (entry - stop);
  const reward = dir * (target - entry);
  if (!(risk > 0) || !(reward > 0)) return null;

  const total = risk + reward;
  return {
    risk,
    reward,
    ratio: reward / risk,
    riskFraction: risk / total,
    rewardFraction: reward / total,
    stopPctFromEntry: (stop - entry) / entry,
    targetPctFromEntry: (target - entry) / entry,
  };
}

/** Format a reward-to-risk ratio as "2.5 : 1" (one decimal, whole numbers trimmed). */
export function formatRatio(ratio: number): string {
  const n = Math.round(ratio * 10) / 10;
  const text = Number.isInteger(n) ? String(n) : n.toFixed(1);
  return `${text} : 1`;
}

/**
 * A screen-reader sentence summarizing the bar, since the bar itself is
 * `aria-hidden` decoration. Spells the ratio as "2.5 to 1" so it reads aloud
 * cleanly. The signed percentages convey direction (a buy's stop reads as a
 * negative move from entry; a sell's stop reads as a positive one).
 */
export function describeRiskReward({
  action,
  entry,
  stop,
  target,
  rr,
}: {
  action: TradeAction;
  entry: number;
  stop: number;
  target: number;
  rr: RiskReward;
}): string {
  const ratioText = formatRatio(rr.ratio).replace(" : ", " to ");
  return (
    `${action === "buy" ? "Buy" : "Sell"} — entry ${formatCurrency(entry)}, ` +
    `stop ${formatCurrency(stop)} (${formatPercent(rr.stopPctFromEntry)}), ` +
    `target ${formatCurrency(target)} (${formatPercent(rr.targetPctFromEntry)}), ` +
    `reward-to-risk ${ratioText}.`
  );
}
