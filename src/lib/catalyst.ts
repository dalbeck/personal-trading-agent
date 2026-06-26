/**
 * Display + policy helpers for a proposal's `catalystType` (M3). The desk wants
 * a **named catalyst** behind every entry — what changed that makes *now* the
 * time. A `none` (trend alone, no catalyst) — or a missing one — is the **weak**
 * kind: a momentum chase with nothing behind it, flagged in the UI and by the
 * red-team. Plain module (no `server-only`) so client and server both import it.
 */
import type { TradeProposal } from "@/lib/types";

export type CatalystType = NonNullable<TradeProposal["catalystType"]>;

export const CATALYST_TYPE_LABEL: Record<CatalystType, string> = {
  earnings_momentum: "Earnings momentum",
  product_news: "Product news",
  sector_rotation: "Sector rotation",
  guidance: "Guidance",
  other: "Other",
  none: "None",
};

/** A missing catalyst or an explicit `none` (trend-alone) is the weak kind. */
export function isWeakCatalyst(
  catalystType: CatalystType | null | undefined,
): boolean {
  return catalystType == null || catalystType === "none";
}

/** Short human label for a catalyst type, or "Unspecified" when absent. */
export function catalystTypeLabel(
  catalystType: CatalystType | null | undefined,
): string {
  return catalystType ? CATALYST_TYPE_LABEL[catalystType] : "Unspecified";
}
