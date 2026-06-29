# Core-long charter — the long-term / core sleeve

> **Inherited safety envelope (shared, non-negotiable).** This sleeve inherits the
> cross-sleeve safety envelope enforced in `../charter.config.ts` and
> `src/lib/server/live-guards.ts` — see [the sleeve README](README.md#inherited-safety-envelope-shared-non-negotiable).
> The Phase-3 live envelope (`LIVE_LIMITS`: account-exposure ceiling, weekly
> funding cap, live drawdown kill switch), the single **6-order/day** counter, the
> **two-gate + per-trade human approval** model, and the prohibited universe
> (options / crypto / futures / margin) all bind this sleeve unchanged. A core-long
> order that would breach the live exposure ceiling is rejected and journaled like
> any other. The agent can never raise a rail, open a gate, or edit this charter.
> **Not investment advice.**

`core-long` is the desk's **long-term / core** sleeve (quarters–years) and the one
deliberate exception to the swing desk's "US single names, a stop on every entry,
SPY never a holding." It runs the **same governed pipeline** (research → checklist
→ risk rails → red-team → human-approved, gated execution) as every other sleeve —
only the entry criteria, universe, sizing, lens, and cadence differ. **Opt-in, off
by default** (`coreLongSleeveEnabled`).

## Mandate

A buy-and-hold core book. The entry thesis leads on **allocation fit, business (or
fund) quality, and valuation (or expense ratio)** — not a technical setup.
Counter-trend entries and the absence of a near-term catalyst are **normal here**,
not strikes.

## Universe (the exception)

- **ETFs and index funds are permitted holdings**, and **SPY / VOO / QQQ are NOT
  excluded** — they are valid core holdings in this sleeve. (They remain
  benchmark-only and SPY-excluded in the swing sleeves; nothing about the swing
  universe changes.) ETFs/index funds trade as equity-class instruments, so the
  asset-class rail already admits them; the per-sleeve change is clearing the
  benchmark exclusion. A liquidity floor still applies; the ATR volatility cap does
  not gate broad ETFs.

## Sizing & risk (the exception)

- Sized by **target allocation weight** (`sizingModel: target-weight`), bounded by
  the sleeve's per-position size cap (`CORE_LONG_LIMITS`, up to 60% per name) and
  the shared live exposure envelope.
- **No protective stop** (`requiresStop: false`). A **wide drawdown/review trigger**
  (the `review-trigger` rail, ≤ 50%) stands in — it flags a human review on a deep
  drawdown, it is **not** an auto-exit.
- Rail numbers live in `../charter.config.ts` (`CORE_LONG_LIMITS`) and are
  tripwire-tested; the looser per-name and sector caps reflect that a core position
  is meant to be concentrated. The account-level drawdown halt and the live
  envelope still bind.

## Red-team lens

Prosecuted under the **core-long** lens (never merged with trend / value / mid). It
must **not** reject for counter-trend or an absent near-term catalyst. It instead
prosecutes: **overpaying vs long-term value, thesis drift / story stock,
over-concentration vs the target allocation, fund quality (expense ratio / tracking
error / structure) for ETFs, and an unrealistic long-term return assumption.**

## Checklist

Leads on **target weight & allocation fit, valuation vs long-term value, quality
(durable business or low-cost fund), and a drawdown/review trigger** in place of a
stop. The breakout-volume and catalyst-timing items are **dropped** (counter-trend
and "no near-term catalyst" are normal here).

## Benchmark & cadence

Benchmarked against **SPY total return** (a core book that is roughly the index
should be measured against it honestly). Reviewed on a **quarterly** cadence —
core does not want a daily idea hunt.

## Change-log (core-long sleeve)

> **2026-06-28 — Long-term / core sleeve authorized (core-long M3).** Enabled the
> `core-long` sleeve (quarters–years): the universe permits **ETFs and index funds**
> and **does not exclude SPY/VOO/QQQ** (for this sleeve only — the swing universe is
> unchanged); positions are **sized by target allocation weight** with **no
> protective stop** (a wide drawdown/review trigger stands in); and it carries its
> **own red-team lens** (overpaying vs long-term value, thesis drift,
> over-concentration, fund quality / expense ratio, unrealistic long-term return —
> never merged with the other lenses) and its **own checklist** (allocation fit,
> valuation, quality, review trigger; breakout-volume and catalyst-timing dropped).
> A manual analyze-a-symbol can produce a core-long proposal (the `sleeve` +
> `targetWeightPct` on `POST /api/proposals/analyze`); discovery surfacing is gated
> by `coreLongSleeveEnabled` (off by default). Execution stays the same two-gate,
> per-trade-approved, gate-closed-→-dry-run path. **No shared guard changed:** the
> 6-order/day cap and the live envelope still bind. See
> `planning/portfolio-sleeves-and-horizons-spec.md`.
