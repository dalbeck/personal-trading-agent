/**
 * Display + policy helpers for a proposal's `strategy` (value-sleeve M1) — which
 * mandate it is judged under. `trend` is the desk's primary technical
 * trend-following strategy; `value` is the deliberately **separate** value /
 * mean-reversion sleeve where **fundamentals lead** and counter-trend is
 * *expected*. The two mandates are never merged: the strategy drives the
 * checklist + red-team lens, while the hard risk rails stay shared and
 * unchanged. Plain module (no `server-only`) so client and server both import
 * it — mirrors `target-type.ts` / `catalyst.ts`.
 */
import type { TradeProposal } from "@/lib/types";

export type Strategy = NonNullable<TradeProposal["strategy"]>;

/** The selectable lenses, in display order. */
export const STRATEGIES: readonly Strategy[] = ["trend", "value"] as const;

export const STRATEGY_LABEL: Record<Strategy, string> = {
  trend: "Trend",
  value: "Value",
};

/** One-line description of each mandate — used in the lens picker + tooltips. */
export const STRATEGY_DESCRIPTION: Record<Strategy, string> = {
  trend:
    "Technical trend-following — momentum, relative strength, breakout/pullback entries above rising moving averages.",
  value:
    "Value / mean-reversion — fundamentals lead; cheap quality near multi-year lows with a real catalyst or floor. Counter-trend is expected.",
};

export function isValueStrategy(
  strategy: Strategy | null | undefined,
): boolean {
  return strategy === "value";
}

/** Short human label for a strategy, defaulting to the trend mandate. */
export function strategyLabel(strategy: Strategy | null | undefined): string {
  return STRATEGY_LABEL[strategy ?? "trend"];
}
