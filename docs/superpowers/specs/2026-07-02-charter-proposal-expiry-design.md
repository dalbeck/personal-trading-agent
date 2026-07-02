# Design — Charter: pending proposals expire

**Date:** 2026-07-02
**Branch:** `chore/charter-proposal-expiry`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — Charter improvement #6.
**Series:** third charter/playbook sub-branch (after CB1 shorts, CB2 sector).

## Problem

`data/proposals/` accumulates stale pending ideas (the eval noted 40+, many
stale manual ones). Only price drift is guarded — a week-old thesis is still
actionable in the queue and the paper batch.

## Approach

- **Charter rule** (`strategy/charter.md`): a **pending** proposal expires —
  dropped to a new **`expired`** status — when its `reviewByDate` passes, or
  **`proposalExpiryDays` (5)** days after `createdAt` if it has no `reviewByDate`.
  `proposalExpiryDays: 5` added to `DISCOVERY_LIMITS`
  (`strategy/charter.config.ts`), mirrored in charter.md, with a tripwire assert.
- **Schema** (`src/lib/schemas.ts`): add `"expired"` to the proposal status enum.
- **Code** — new `src/lib/server/proposal-expiry.ts`:

  ```ts
  export function isProposalExpired(p: TradeProposal, nowMs: number, maxAgeDays: number): boolean
  export async function expireStaleProposals(opts?: {
    now?: string; dataDir?: string;
    proposals?: TradeProposal[]; setStatus?: typeof setProposalStatus;
    maxAgeDays?: number;
  }): Promise<{ expired: number }>
  ```

  `expireStaleProposals` reads the pending proposals, flips each expired one to
  `expired` via `setProposalStatus`, and returns the count. Expiry test:
  `reviewByDate` (when set) < now, OR `createdAt + maxAgeDays` < now. Injectable
  `now` / `proposals` / `setStatus` seams.
- **Wire** — call `expireStaleProposals()` in the routine handler
  (`src/app/api/routines/[id]/route.ts`) on **every** routine run (best-effort,
  cheap), so expiry happens on the existing schedule. Expired proposals then drop
  out of `pendingOnly` reads (the review queue and the paper batch) automatically.

## Testing (TDD)

- `isProposalExpired`: past `reviewByDate` → true; older than `maxAgeDays` with no
  `reviewByDate` → true; a fresh proposal → false.
- `expireStaleProposals`: flips a stale pending proposal to `expired` via the
  seam; leaves a fresh one and a non-pending one untouched; returns the count.
- Schema accepts `"expired"`.
- `proposalExpiryDays` tripwire matches charter.md (5).
- Full suite + typecheck + lint stay green.

## Out of scope (later charter sub-branches)

Sleeve checklists + rules-view, value-quality bars, earnings-blackout, discipline
rules, charter doc-honesty pass.
