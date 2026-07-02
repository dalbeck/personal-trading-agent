# Design — Correctness fixes batch (counter lock, nowET, symbol, dryRun)

**Date:** 2026-07-02
**Branch:** `fix/correctness-batch`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — medium/low items.
**Series:** second of the self-contained medium/low fixes.

Four small, cohesive correctness fixes:

## 1. Order-counter race (medium)
`incrementOrdersToday` is an unlocked read-modify-write on `order-counter.json`,
shared across the Next server and the routine process — two concurrent
increments can both read `N` and write `N+1`, so the ≤6/day cap can admit a 7th.
Wrap the RMW in `withRetryingLock("order-counter")` (the H8 primitive) and write
via `atomicWrite` (tmp+rename). Serializes cross-process; the count is never
lost.

## 2. `nowET()` returns UTC despite the name (low)
Two route-local `nowET()` helpers return `new Date().toISOString()` (UTC), which
is misleading — a caller could `slice(0,10)` it expecting the ET date. The ET
day is already derived correctly downstream via `etDay()` (America/New_York), so
the value is fine; the **name** is the bug. Rename both to `nowIso()` with a note
that the ET day is derived via `etDay`.

## 3. Symbol pattern admits `.` / `..` (low)
`SYMBOL_PATTERN = /^[A-Z0-9.\-]{1,12}$/` matches `"."` and `".."` (all
dots/dashes). Require a **leading alphanumeric**:
`/^[A-Z0-9][A-Z0-9.\-]{0,11}$/` — so `BRK.B` still validates but a bare `.` /
`..` does not.

## 4. `blocked-caps` returns `dryRun: false` though nothing placed (low)
Every other blocked outcome reports `dryRun: true` (no real money touched);
`blocked-caps` returns `false`, implying a real placement. Nothing was placed on
a block — return `dryRun: true` for consistency and honesty.

## Testing (TDD)

- `isValidSymbol`: `"."` / `".."` / `".A"` → false; `AAPL` / `BRK.B` / `BRK-B`
  → true.
- `incrementOrdersToday`: still increments and resets per ET day (regression);
  runs under the `order-counter` lock (H8 `withRetryingLock` already tested).
- `submitTradeApproval`: a `blocked-caps` outcome carries `dryRun: true`.
- Full suite + typecheck + lint stay green.

## Out of scope

Conviction-ranking prompt-injection cap and the stray-`data/`-scripts + backup
cleanup (their own follow-ups).
