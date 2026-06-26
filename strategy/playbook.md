# Playbook

The pre-trade checklist and banked lessons. Unlike the charter, this file
**evolves**: the weekly coaching pass promotes durable lessons into the banked
section (each tagged with the date it was promoted and its source).

## Strategy identity

This is a **technical trend-following desk.** Technical evidence (trend,
momentum, relative strength, volume, structure) is the **primary** rationale for
every entry, and the profit target is technically anchored. **Fundamentals are a
catalyst-check and a disqualifier only** — they can supply the named catalyst or
veto a setup (a value trap, an imminent earnings binary), but a thesis that
leads with valuation or fundamentals ("cheap," "undervalued") is out of mandate
and the red-team penalizes it. (See the charter's Analytical identity section.)

## Pre-trade checklist

Every proposal should clear these before it reaches the red-team. A weak answer
on any single item is a reason to pass or to downsize.

1. **Thesis** — one sentence on why this name, why now. The **primary rationale
   must be technical** (trend / momentum / relative strength / volume /
   structure); fundamentals appear only as the catalyst-check (see Strategy
   identity). A valuation- or fundamental-led thesis is out of mandate.
2. **Trend** — price above a rising 50-day and 200-day; structure of higher
   highs / higher lows intact. No counter-trend entries.
3. **Momentum** — entering on a constructive reset (pullback to the rising
   20/50-day or a base-breakout retest), not chasing an extended move.
4. **Volume** — confirm the move with **relative volume** (entry-day volume ÷
   the 20–50-day average). A breakout/momentum entry should come on
   **above-average** volume (**≥ ~1.3–1.5×**); a pullback/reset entry should
   come on **declining / below-average** volume. A breakout on quiet volume — or
   a pullback on a volume spike — is a weak entry. Soft signal (weighed, not a
   hard rail).
5. **Relative strength** — leading its sector and outperforming SPY over the
   recent window; avoid laggards.
6. **Volatility** — passes the charter volatility filter (20-day ATR within the
   universe cap); the stop distance is sane relative to ATR.
7. **Catalyst & timing** — note any earnings/event risk inside the holding
   window; avoid binary events unless the thesis explicitly accounts for them.
8. **Sizing** — define the protective stop **first** (the **tighter** of a fixed
   −8% and an ATR-based level — deterministic, never discretionary), then size so
   the stop costs **≤2%** of equity and the position is **≤20%** of equity.
   Reward/risk must be **≥2:1**.
9. **Target** — the profit target must be **technically or fundamentally
   anchored** (`prior_high`, `measured_move`, `atr_multiple`, or `fundamental`),
   **not a sell-side `analyst_price`** — an analyst target is the desk taking
   someone else's number, and the red-team flags it weak.
10. **Winner-exit** — define how the trade *exits a winner* at entry: a profit
    target **or** a trailing-stop rule. Govern the upside, not just the stop.
11. **Correlation / sector** — does this overlap existing book exposure? Respect
    the **40%** per-sector cap and the 5-position cap; trim size on overlap.
12. **Red-team** — the prosecutor defaults to "no"; the thesis must survive it.

## Banked lessons

Durable lessons promoted from the coaching log. Newest first.

- **Prefer pullback entries over breakout chases.** Breakout chases widen the
  stop and degrade reward/risk. _(Promoted 2026-06-15, from c-2026-06-15.)_
- **Honor the trim trigger on losers** approaching the stop rather than hoping
  for a base.
- **Let the governance filters work** — recorded rejections (volatility cap,
  risk-cap breaches, red-team "no") have avoided more losers than they've cost
  in missed upside.

## Change log

Structural edits to this playbook (distinct from the banked lessons above).
Newest first.

- **2026-06-25** — **Relative-volume check (strategy coherence M2).** Added a
  **Volume** checklist item: confirm the move with relative volume (entry-day ÷
  the 20–50-day average) — breakouts want above-average (≥ ~1.3–1.5×), pullbacks
  want below-average; a soft signal weighed by the checklist + red-team, not a
  hard rail. Proposals now carry a `relativeVolume` figure (surfaced on the
  proposal card + symbol view). See `planning/strategy-coherence-spec.md`.
- **2026-06-25** — **Analytical identity (strategy coherence M1).** Added the
  **Strategy identity** section and made the Thesis checklist item require a
  **technical primary rationale**, with fundamentals as a catalyst-check /
  disqualifier only. Mirrors the charter's new Analytical identity section. See
  `planning/strategy-coherence-spec.md`.
