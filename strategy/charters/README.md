# Sleeve charters — shared safety envelope & cross-sleeve change-log

This directory holds the **per-sleeve charters**. The desk runs one governed
pipeline (research → checklist → risk rails → red-team → human-approved, gated
execution) across multiple **sleeves** (`style × horizon`). Each sleeve has its
own mandate, universe, rails, sizing model, red-team lens, checklist, benchmark,
and cadence — routed in [`../sleeves.config.ts`](../sleeves.config.ts). The one
thing every sleeve shares, and **no sleeve may override**, is the safety envelope
below.

> **The swing desk's constitution is [`../charter.md`](../charter.md)** — the
> funded account's immutable rules. It is **not edited by the sleeve work**; it
> remains the swing charter with its own change-log. New mandates live in this
> directory (`core-long.md`, `position-mid.md`); cross-sleeve framework notes
> live in this file's change-log.

## Inherited safety envelope (shared, non-negotiable)

Every sleeve inherits the following. These are **enforced in code** — their
source of truth is [`../charter.config.ts`](../charter.config.ts) and the live
guards in `src/lib/server/live-guards.ts`, kept in lockstep by the tripwire tests
(`charter-config.test.ts`, `sleeves-config.test.ts`). This section is
documentation of those enforced caps; **editing the prose here never changes
enforcement.** A sleeve can never define its own envelope, and the agent can
never raise any rail or open a gate.

- **The Phase-3 live envelope is cross-sleeve and fixed** — `LIVE_LIMITS`: the
  account-exposure ceiling, the weekly funding cap, and the live drawdown kill
  switch. Adding sleeves never increases total real-money exposure beyond it; an
  order in any sleeve that would breach it is rejected and journaled.
- **One shared daily order budget** — the single `maxOrdersPerDay` (6) is one
  counter across *all* sleeves. More sleeves never means more daily orders.
- **Two-gate, per-trade human approval** — every sleeve's approvable proposals
  flow the same `POST /api/live/approve` path; gate closed → dry-run sink, gate
  open → broker. The agent never opens a gate, funds the account, or places an
  order without explicit per-trade human approval. The app never auto-trades.
- **Prohibited universe** — options, crypto, futures, and margin are excluded for
  every sleeve. ETF/index permission is a *per-sleeve universe* grant (core-long
  only), never a global one; SPY/VOO/QQQ stay benchmark-only in the swing sleeves.
- **The agent never edits a charter or this file, and never raises a rail.**
  Charters and the rail config are human-owned constitution.

## Per-sleeve change-logs

Swing changes → [`../charter.md`](../charter.md). Per-sleeve mandate changes →
that sleeve's charter (`core-long.md` / `position-mid.md`). **Cross-sleeve**
changes (framework, rails-routing, portfolio layer, tax, verdict matrix) → the
change-log below. Newest first.

## Change-log (cross-sleeve)

> **2026-06-28 — Sleeve model: style × horizon (sleeve-framework M1).** Promoted
> the per-proposal **`strategy`** (`trend | value`) into a first-class **`sleeve`**
> with a **`horizon`** (`swing | mid | long`). The existing mandates became
> **`swing-trend`** (default) and **`swing-value`** sleeves with **byte-identical
> rails, universe, sizing, and red-team lenses** — no swing behavior changed; the
> `charter.config.ts` swing rail numbers are untouched and stay tripwire-tested
> (`sleeves-config.test.ts` re-asserts the swing sleeves route to `charter.md` and
> the unchanged `RISK_LIMITS`). Declared (disabled) two new horizons for later
> milestones: **`position-mid`** (weeks–quarters) and **`core-long`**
> (quarters–years, **ETF/index-allowing**, **target-weight sizing**, **no
> protective stop** — a wide drawdown/review trigger instead). A sleeve bundles
> `{ horizon, mandate, universe, sizingModel, rails, redTeamLens, checklist,
> benchmark, cadence }`; sleeves differ only in entry criteria, rails, sizing,
> lens, and cadence — **never in the real-money envelope**. The Phase-3
> `LIVE_LIMITS` ceiling and the 6-order/day cap remain **cross-sleeve and
> unchanged**, and the two-gate + per-trade-approval safety model is unchanged.
> New sleeves are **opt-in** (off by default), like the value sleeve. Rationale:
> extend the same governed pipeline from a single swing mandate to a multi-horizon
> portfolio manager without weakening any guard. See
> `planning/portfolio-sleeves-and-horizons-spec.md`.
