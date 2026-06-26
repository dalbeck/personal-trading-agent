/**
 * Display + policy helpers for a proposal's `targetType` (M3). A profit target
 * must be technically or fundamentally anchored; a sell-side `analyst_price` —
 * or a missing target — is **weak** (the desk borrowing someone else's number),
 * flagged in the UI and by the red-team. Plain module (no `server-only`) so
 * client and server can both import it.
 */
import type { TradeProposal } from "@/lib/types";

export type TargetType = NonNullable<TradeProposal["targetType"]>;

export const TARGET_TYPE_LABEL: Record<TargetType, string> = {
  prior_high: "Prior high",
  measured_move: "Measured move",
  atr_multiple: "ATR multiple",
  fundamental: "Fundamental",
  analyst_price: "Analyst price",
};

/** A missing target or a sell-side analyst price is the weak kind. */
export function isWeakTarget(targetType: TargetType | null | undefined): boolean {
  return targetType == null || targetType === "analyst_price";
}

/** Short human label for a target type, or "Unspecified" when absent. */
export function targetTypeLabel(
  targetType: TargetType | null | undefined,
): string {
  return targetType ? TARGET_TYPE_LABEL[targetType] : "Unspecified";
}
