# Design — Atomic writes, proposal locking, resilient list reads (H8)

**Date:** 2026-07-02
**Branch:** `fix/atomic-writes-and-locking`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — **H8**.
**Series:** eighth remediation branch (C1, H1, H2, H3, H4, H7, H5 merged).

## Problem

- **Torn writes.** Every persist is a bare `writeFile` (the "atomically-ish"
  comment in `writers.ts` is aspirational). A crash mid-write leaves a truncated
  file.
- **One bad file bricks the dashboard.** `readDir` (`data.ts`) reads a directory
  with `Promise.all(files.map(readOne))`, and `readOne` throws on malformed JSON
  or a schema mismatch — so a **single** corrupt proposal rejects the whole
  `readProposals()` and takes down the dashboard + approval flow.
- **Unlocked read-modify-write.** The proposal mutators (`setProposalStatus`,
  `setProposalRedTeam`, `overwriteProposal`, `markTrancheFilled`, `setStagedPlan`)
  read-all → edit-one → write with no lock. The routine runner is a **separate
  process** from the Next server, so a sweep stamping a verdict can clobber a
  concurrent human status change.

## Approach

### 1. `atomicWrite(absPath, contents)`

New shared helper: `mkdir` the parent, write to `<absPath>.<rand>.tmp` in the
**same directory**, then `rename` onto the target (atomic on one filesystem); on
any error, unlink the tmp file and rethrow. A crash now leaves either the intact
old file or the intact new one — never a partial.

- Wire it into `writers.ts` `writeStructured` + `writeNarrative` — this covers
  **all** the `data/` artifacts readers fail loudly on (proposals, snapshots, run
  logs, news, coaching, watchlist).
- Sweep the other single-file state writers through it for consistency:
  `allocation-targets.ts`, `discovery-settings.ts`, `risk-settings.ts`,
  `live-high-water.ts`, `market-conditions.ts`, `strategy.ts`,
  `order-idempotency.ts`. (`lockfile.ts` keeps its `wx`-flag exclusive create —
  that is deliberately non-atomic-rename.)

### 2. `withRetryingLock` + serialize proposal mutations

`lockfile.ts` already has `withLock`, but it returns `null` immediately on
contention (drops the task). Add:

```ts
export async function withRetryingLock<T>(
  name: string, task: () => Promise<T>,
  opts?: LockOpts & { retries?: number; retryDelayMs?: number },
): Promise<T | null>  // null only after retries are exhausted
```

It retries acquisition (default 10 × 50 ms) before giving up. Route all five
proposal mutators through **one shared lock** (`"proposals"`) so cross-process
mutations serialize. On exhausted retries the mutator returns `null` — its
existing `WriteResult | null` contract (callers already treat `null` as a
no-op/failure), so a busy store degrades loudly-enough, never a silent clobber.
Fast single-file ops make exhaustion very unlikely.

### 3. Resilient list reads

`readDir` switches to `Promise.allSettled`: a file whose `readOne` rejects is
**skipped** with a `console.warn` naming it and the error, and the good files are
returned. One corrupt proposal no longer bricks `readProposals()`.
`validateDataDir` has its own strict readdir + `safeParse` loop, so corruption is
still caught by validation — the resilience is runtime-read only.

Applies to every list read (proposals, snapshots, logs, news, coaching) per the
owner's choice.

## Testing (TDD)

- `atomicWrite`: writes the exact content; overwrites an existing file; leaves no
  `*.tmp` behind; creates the parent dir.
- `withRetryingLock`: a task runs while the lock is held; a second call under
  contention **waits** for release and then runs (serialized), not dropped;
  returns `null` only when retries are exhausted (retries: 0 against a held lock).
- Proposal mutation under the lock: `setProposalStatus` still applies normally
  (regression) and runs inside the `"proposals"` lock.
- `readDir` resilience: a temp `TRADING_DATA_DIR` proposals dir with one
  malformed file + several valid ones → `readProposals()` returns the valid ones
  and does not throw (and warns for the bad file).
- Full suite + typecheck + lint stay green.

## Out of scope (follow-ups)

- The unlocked order-counter and Perplexity daily-cap TOCTOU (separate medium
  items).
- H6 broker-side stops; routine curl narrowing / C2 (parked).
