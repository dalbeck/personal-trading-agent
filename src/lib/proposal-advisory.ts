/**
 * Advisory-proposal helpers (Phase 3 — Robinhood live).
 *
 * Two kinds of live proposal now exist, distinguished by the `advisory` flag:
 *
 *   - **advisory** (`advisory: true`) — manual guidance the human executes by
 *     hand in Robinhood. It must NEVER reach an execution path; the UI offers
 *     only review/dismiss. This stays the default for live discovery output.
 *   - **approvable** (`advisory: false`, opt-in) — the human can approve it and
 *     **the app places the order on approval**. It flows the normal approval
 *     path (`/api/live/approve` → `submitTradeApproval` → `routeApprovedOrder`).
 *     The **two-gate order gate** is the real-money boundary: gate CLOSED routes
 *     it to the dry-run sink (paper/mock, never Robinhood); gate OPEN (a
 *     deliberate human action) routes it to real Robinhood. Per-trade human
 *     approval is always required.
 *
 * So "advisory" is now defined by **intent (the flag)**, not by account. The
 * gate — not this flag — is what keeps a real-money order unreachable until the
 * human opens it (`assertLiveOrderAllowed` fails closed). See
 * `planning/live-execution-spec.md`.
 *
 * Client-safe (no `server-only`): the approval route, the review route, and the
 * Proposals UI all import these so the definitions are single-sourced.
 */

import type { TradeProposal } from "@/lib/types";

/** The unmistakable tag shown on every live-advisory (manual) proposal. */
export const ADVISORY_TAG = "live · advisory · execute manually";

/** The tag shown on an approvable live proposal (the app places it on approval,
 *  gated). */
export const LIVE_APPROVE_TAG = "live · approve to place";

/** The terminal states a human can set on an advisory proposal. Neither places
 *  an order — they only record that the guidance was acted on or set aside. */
export const ADVISORY_DECISIONS = ["reviewed", "dismissed"] as const;
export type AdvisoryDecision = (typeof ADVISORY_DECISIONS)[number];

/**
 * True when a proposal is **advisory** (manual guidance) and therefore must
 * never reach the order path. Defined by the explicit `advisory` flag only — an
 * approvable live proposal (`advisory: false`) is NOT advisory and is allowed to
 * the approval path, where the order gate (not this flag) is the real-money
 * boundary.
 */
export function isAdvisoryProposal(
  p: Pick<TradeProposal, "account" | "advisory">,
): boolean {
  return p.advisory === true;
}
