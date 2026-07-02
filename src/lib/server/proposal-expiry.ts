import "server-only";

import { DISCOVERY_LIMITS } from "@strategy/charter.config";
import type { TradeProposal } from "@/lib/types";
import { readProposals } from "./data";
import { setProposalStatus } from "./writers";

const DAY_MS = 86_400_000;

/**
 * Whether a pending proposal has gone stale (charter: proposal-expiry). A
 * `reviewByDate` takes precedence — the proposal expires at the END of that day;
 * with no review date it expires `maxAgeDays` after `createdAt`. Time-only, so it
 * is pure + testable with an injected clock.
 */
export function isProposalExpired(
  p: TradeProposal,
  nowMs: number,
  maxAgeDays: number,
): boolean {
  if (p.reviewByDate) {
    const rb = Date.parse(p.reviewByDate);
    // Expire at the end of the review day (a same-day review is still due).
    return Number.isFinite(rb) ? nowMs > rb + DAY_MS : false;
  }
  const created = Date.parse(p.createdAt);
  if (!Number.isFinite(created)) return false;
  return nowMs - created > maxAgeDays * DAY_MS;
}

/**
 * Drop every stale **pending** proposal to `expired` (charter: proposal-expiry),
 * so the review queue and the paper batch (both `pendingOnly`) stop surfacing
 * week-old ideas. Runs on the routine cadence. Returns the count expired.
 * `now` / `proposals` / `setStatus` / `maxAgeDays` are injectable for tests.
 */
export async function expireStaleProposals(opts?: {
  now?: string;
  dataDir?: string;
  proposals?: TradeProposal[];
  setStatus?: typeof setProposalStatus;
  maxAgeDays?: number;
}): Promise<{ expired: number }> {
  const nowMs = Date.parse(opts?.now ?? new Date().toISOString());
  const maxAgeDays = opts?.maxAgeDays ?? DISCOVERY_LIMITS.proposalExpiryDays;
  const setStatus = opts?.setStatus ?? setProposalStatus;
  const pending = (
    opts?.proposals ?? (await readProposals({ pendingOnly: true }))
  ).filter((p) => p.status === "pending");

  let expired = 0;
  for (const p of pending) {
    if (!isProposalExpired(p, nowMs, maxAgeDays)) continue;
    const ok = await setStatus(p.id, "expired", { dataDir: opts?.dataDir })
      .then(() => true)
      .catch(() => false);
    if (ok) expired += 1;
  }
  return { expired };
}
