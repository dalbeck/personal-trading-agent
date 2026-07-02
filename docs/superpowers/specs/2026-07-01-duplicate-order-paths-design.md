# Design — Close the duplicate-order paths (H7)

**Date:** 2026-07-01
**Branch:** `fix/duplicate-order-paths`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — **H7**.
**Series:** sixth remediation branch (C1, H1, H2, H3, H4 merged).

## Problem

Two ways the desk can place the same position twice:

1. **Tranche fallback → full position.** In the approve route
   (`src/app/api/live/approve/route.ts:126–135`), the tranche resolver collapses
   "no tranche requested" and "tranche requested but not pending" into
   `trancheIdx = null`. So a lagged re-tap of an already-**filled** tranche
   (`body.tranche: 0`, tranche 0 already `filled`) falls through to a
   **full-position** approve under the bare `proposalId` idempotency key — which
   can place 4/3 of the intended position. `route.test.ts:204` currently
   enshrines this behavior.

2. **Paper batch never marks executed.** `executePendingProposals`
   (`src/lib/server/execute.ts`) places paper orders but never flips a proposal's
   status. It reads `readProposals({ pendingOnly: true })`, so a re-fired
   market-open routine re-places everything; and the same still-`pending`
   proposal can also be approved via the live path (no shared dedup).

## Approach

### 1. 409 on a non-pending tranche (approve route)

Distinguish "no tranche requested" from "tranche requested but not placeable":

```ts
const trancheRequested =
  decision === "approve" && plan && typeof body.tranche === "number" && Number.isInteger(body.tranche);
if (trancheRequested) {
  const t = plan!.tranches.find((x) => x.index === body.tranche);
  if (!t || t.status !== "pending") {
    return Response.json(
      { error: "tranche already filled or invalid — refresh the plan", tranche: body.tranche },
      { status: 409 },
    );
  }
}
```

- `body.tranche` absent → full-position approve (unchanged).
- `body.tranche` present + a matching **pending** tranche → place that tranche
  (unchanged, key `${proposalId}#t${index}`).
- `body.tranche` present + already-filled / out-of-range → **409**, never a
  full-position fallback.

`route.test.ts:204` ("ignores an already-filled tranche index and approves the
full position") is inverted to assert the 409 and that `submitTradeApproval` is
never called.

### 2. Flip status after a paper placement (execute.ts)

`executePendingProposals` gains an injectable `setStatus` seam (default
`setProposalStatus`). After a `placed` / `downsized` outcome:

```ts
await setStatus(p.id, "approved", { dataDir: opts.dataDir }).catch(() => {});
```

- Only **placed/downsized** proposals flip to `approved`. A rejected proposal
  stays `pending` so the next run re-evaluates it (avoids the "skip a reject
  forever" anti-pattern).
- The batch reads `pendingOnly`, so a re-fire skips the now-`approved` proposal.
- The live approve route already returns 409 on `status !== "pending"`, so the
  same flip also blocks the cross-path (batch-placed → human-approved) double
  place. The status field is the shared dedup; no separate records store is
  needed.

## Testing (TDD)

- **Approve route** (`route.test.ts`):
  - an already-filled tranche index → **409**, `submitTradeApproval` NOT called
    (inverts the old test);
  - an out-of-range tranche index → 409;
  - a valid pending tranche → still places that tranche's qty (regression);
  - no `tranche` field → full-position approve (regression).
- **Paper batch** (`execute.test.ts`):
  - a placed proposal flips to `approved` via the `setStatus` seam;
  - a rejected proposal stays `pending` (seam not called for it);
  - the batch is idempotent across a re-run once a proposal is no longer pending.
- Full suite + typecheck + lint stay green.

## Out of scope (follow-ups)

- The unlocked order-counter race and other medium items.
- Routine `Bash(curl:*)` narrowing and **C2** (parked).
