# Design — Live drawdown high-water mark (H1)

**Date:** 2026-07-01
**Branch:** `fix/live-drawdown-high-water`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — **H1**.
**Series:** second remediation branch (after C1 auth). H2 + emergency-stop
fail-closed is the next branch; this one is H1 in isolation.

## Problem

`buildLiveSnapshot` hardcodes `equityCurve: []`
(`src/lib/server/robinhood.ts:275`). Every consumer that derives a high-water
mark from `snapshot.equityCurve` therefore sees high-water = current equity for
the **live** account, so drawdown is always 0. Two live-money safety mechanisms
are dead as a result:

1. **The −10% drawdown kill latch** — `liveDrawdown`
   (`src/lib/server/live-guards.ts:99`) → `enforceLiveDrawdownKill`, run on every
   live refresh in `refreshLiveAccount` (`src/lib/server/account.ts:163`). It can
   never breach, so the charter's advertised live kill never fires.
2. **The `drawdown-halt` approval rail** — `validators.ts:220` uses
   `ctx.highWaterEquity`, fed from `highWater(snapshot)` at
   `src/lib/server/live-order.ts:516`. For a live order `highWaterEquity` =
   current equity, so `haltLevel = equity * 0.9` and the rail never fires.

The **paper** account is unaffected: its `equityCurve` comes from Alpaca
(`src/lib/server/alpaca.ts:234`), so paper drawdown already works. This defect is
live-only.

## Approach — a persisted live high-water mark

Rather than reconstruct an equity curve from the dated snapshot history (heavier,
refresh-frequency-dependent), persist a single monotonic high-water mark and
floor both computations with it. This is the eval's suggested "high-water file".

### 1. New store — `src/lib/server/live-high-water.ts`

- `readLiveHighWater(opts?: { dataDir?: string }): Promise<number>` — reads
  `data/control/live-high-water.json` (`{ highWaterUsd, updatedAt }`); returns
  `0` when absent or unreadable (a `0` floor is a no-op, so a missing file
  degrades to today's snapshot-derived behavior — never a false halt).
- `updateLiveHighWater(equity, opts?: { dataDir?; now?: string }): Promise<number>`
  — computes `max(prior, equity)`, persists it, and returns it. **Monotonic**:
  never lowers. The write is **best-effort** (never throws) so it cannot sink the
  live read; a missed write simply means the mark re-raises on the next refresh.

The file is written with the repo's existing structured-write pattern; atomic-write
hardening is deferred to the H8 branch.

### 2. `liveDrawdown` gains a high-water floor

New optional `highWaterFloor` input (via the existing opts/param surface):

```
highWaterUsd = Math.max(snapshot.equity, ...snapshot.equityCurve.map(p => p.equity), highWaterFloor ?? 0, 0)
```

Omitted → identical to today (paper and existing callers untouched).
`enforceLiveDrawdownKill` threads the floor through to `liveDrawdown`.

### 3. `refreshLiveAccount` — the single canonical update point

After the live snapshot is built (`src/lib/server/account.ts`):

```
const hw = await updateLiveHighWater(snapshot.equity, { dataDir });
const kill = await enforceLiveDrawdownKill(snapshot, { dataDir, highWaterUsd: hw });
```

The mark rises only here, on a real live read. Both the update and the kill stay
fail-soft (they already `.catch(() => …)`), so a store hiccup never sinks the
read.

### 4. Approval path floors the live rail context

In `evaluateApprovalBlocks` (`src/lib/server/live-order.ts`), for a **live**
order only:

```
highWaterEquity: Math.max(highWater(snapshot), liveHighWater)
```

where `liveHighWater` comes from an injectable seam (`opts.liveHighWater`),
defaulting to `readLiveHighWater({ dataDir })` when the order account is `live`
and `0` otherwise. Approval only **reads** the mark — a trade decision must not
move a market high-water. The resulting `drawdown-halt` violation is an
**overridable** rail block (consistent with the existing rail UX and the chosen
fail-closed mode).

## Testing (TDD)

- `live-high-water.test.ts` — absent → 0; `updateLiveHighWater` raises + persists;
  a lower equity never lowers the mark; the returned value equals the persisted
  value.
- `live-guards.test.ts` (extend) — `liveDrawdown` with a floor computes drawdown
  off the floor (not the empty curve); `enforceLiveDrawdownKill` halts when the
  floored high-water breaches the kill threshold on a live-shaped snapshot
  (`equityCurve: []`).
- `account` test — a live refresh whose equity sits below a persisted high-water
  trips the kill latch (previously impossible).
- `live-order` approval test — a live order whose snapshot equity is below the
  persisted high-water surfaces an overridable `drawdown-halt` rail violation.
- Full suite + typecheck + lint stay green.

## Out of scope (follow-up branches)

- **H2** — missing-snapshot fail-closed block + emergency-stop fail-closed
  (next branch).
- **H8** — atomic-write hardening of the high-water file and other writers.
