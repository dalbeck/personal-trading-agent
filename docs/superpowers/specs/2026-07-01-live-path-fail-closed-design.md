# Design — Live approval path fails closed when degraded (H2 + emergency-stop)

**Date:** 2026-07-01
**Branch:** `fix/live-path-fail-closed`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — **H2** + the "fail-soft market data" medium item.
**Series:** third remediation branch (after C1 auth, H1 drawdown high-water).

## Problem

Two ways the live approval path silently drops guards in a degraded environment:

1. **H2 — rails skip on a missing snapshot.** `evaluateApprovalBlocks`
   (`src/lib/server/live-order.ts`) wraps *all* rail checks in `if (snapshot)
   {…}`. A missing/unreadable snapshot evaluates **zero** rails — no size,
   sector, count, drawdown, or emergency-stop — and the order sails through with
   `railViolations: []`.
2. **Emergency-stop fail-soft.** `getMarketConditions`
   (`src/lib/server/market-conditions.ts`) collapses "SPY fetch failed" into the
   neutral reading (`spyIntradayChangePct: 0`), which trips no rail. It cannot
   distinguish "SPY flat" from "SPY unavailable", so a market-data outage
   silently disables the emergency stop.

Both surface only on the **live** path. Paper is dry-run safety plumbing and
stays lenient.

## Approach

Scope: **live orders only** (`order.account === "live"`, regardless of whether
the live gate is open — an `account: "live"` order is the live path even when it
routes to the dry-run sink; consistent with H1). Fail-closed mode: **overridable
block**, implemented as synthetic `railViolations` entries so the existing
2-step override flow (`hasValidOverride` → `blocked-risk` journaling) handles
them with no new UI.

### 1. `no-snapshot` block (H2)

In `evaluateApprovalBlocks`, when a **live** order has `snapshot == null`, push

```ts
{ rule: "no-snapshot", message: "No portfolio snapshot — risk rails could not be evaluated. Refresh the live account or override to proceed." }
```

into `railViolations` (the `if (snapshot)` branch is skipped as before, since the
rails genuinely cannot be computed). A paper order with no snapshot is unchanged
(no block). `approvalIsBlocked` already returns true on any `railViolations`
entry, and the block clears on a valid override.

### 2. Market-data availability + `market-data-unavailable` block

Extend `MarketConditions` with availability flags:

```ts
interface MarketConditions {
  spyIntradayChangePct: number;
  vix: number;
  spyAvailable: boolean; // false only when the SPY read genuinely failed
  vixAvailable: boolean;
}
```

`getMarketConditions` sets `spyAvailable`/`vixAvailable` from whether each getter
returned a usable value (true) or fell back to neutral (false). The `NEUTRAL_MARKET`
constant and existing consumers keep working (they read `spyIntradayChangePct` /
`vix` as before).

In `evaluateApprovalBlocks`, for a **live** order with a snapshot, after reading
`market`, if `market.spyAvailable === false` push

```ts
{ rule: "market-data-unavailable", message: "SPY intraday data unavailable — the emergency stop could not be evaluated. Retry or override to proceed." }
```

into `railViolations`.

**SPY-only key.** VIX has no reliable free feed and is neutral-by-design; keying
the block on VIX-unavailability would block every order permanently. The SPY arm
is the reliable broad-market-stress signal, so only its unavailability degrades
the emergency stop.

**Backward compatibility.** An injected `opts.market` (tests, or any explicit
value) is treated as available unless it explicitly sets `spyAvailable: false` —
the block fires only on a real fetch failure via the default getter. Concretely
the check is `market.spyAvailable === false`, so a market object without the flag
never blocks.

## Testing (TDD)

- `market-conditions.test.ts` — a failed/empty SPY read → `spyAvailable: false`
  with the neutral value; a good read → `spyAvailable: true`; VIX absent →
  `vixAvailable: false` (documented, not a live blocker).
- `live-order.test.ts` —
  - a **live** order with `snapshot: null` → a `no-snapshot` rail violation,
    `approvalIsBlocked` true, and `submitTradeApproval` returns `blocked-risk`
    without an override / proceeds with a valid override.
  - a **paper** order with `snapshot: null` → not blocked (unchanged).
  - a **live** order with `market.spyAvailable === false` → a
    `market-data-unavailable` rail violation (overridable).
- Full suite + typecheck + lint stay green.

## Out of scope (still parked / later)

- Routine `Bash(curl:*)` narrowing and **C2** loopback binding (need live
  validation).
- H3+ (red-team mappers, verdict invalidation), H7, H6, H5, H8, charter edits.
