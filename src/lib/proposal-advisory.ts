/**
 * Advisory-proposal helpers (Phase 3 — Robinhood live, read-only + advisory).
 *
 * A **live-advisory** proposal is guidance generated against the real Robinhood
 * Agentic account. It is read-only by construction: the human executes it
 * **manually** in Robinhood. It must NEVER reach an execution path — not the
 * broker, not the dry-run sink — and the UI offers no approve-to-execute action
 * while the harness order gate is closed.
 *
 * Client-safe (no `server-only`): the approval route, the review route, and the
 * Proposals UI all import these so the definition of "advisory" is single-sourced.
 */

import type { TradeProposal } from "@/lib/types";

/** The unmistakable tag shown on every live-advisory proposal. */
export const ADVISORY_TAG = "live · advisory · execute manually";

/** The terminal states a human can set on an advisory proposal. Neither places
 *  an order — they only record that the guidance was acted on or set aside. */
export const ADVISORY_DECISIONS = ["reviewed", "dismissed"] as const;
export type AdvisoryDecision = (typeof ADVISORY_DECISIONS)[number];

/**
 * True when a proposal is live-advisory and therefore non-executable. A live
 * account proposal is advisory in this phase regardless of the explicit flag —
 * we treat EITHER signal as advisory so a missing flag can never downgrade a
 * live proposal into something the approval path would execute (fail-safe).
 */
export function isAdvisoryProposal(
  p: Pick<TradeProposal, "account" | "advisory">,
): boolean {
  return p.advisory === true || p.account === "live";
}
