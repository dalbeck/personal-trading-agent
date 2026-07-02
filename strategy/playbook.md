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

Every proposal carries a **`strategy`** (`trend` | `value`). The checklist below
is the **trend** mandate (the default). The desk also runs a deliberately
**separate, opt-in `value` sleeve** — see the **Value / mean-reversion sleeve**
section below — where fundamentals lead and counter-trend is expected. The two
mandates are never merged; each proposal is judged under the one it carries, and
the **hard risk rails are shared and unchanged** for both.

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
7. **Catalyst & timing** — name the **catalyst**: *why now?* Every proposal must
   carry a named catalyst (`catalyst` + `catalyst_type`: `earnings_momentum`,
   `product_news`, `sector_rotation`, `guidance`, or `other`). A proposal with
   **`none` (trend alone, no catalyst)** is a momentum chase with nothing behind
   it — flagged **weak** by the checklist and the red-team. Still note any
   earnings/event risk inside the holding window, and avoid binary events unless
   the thesis explicitly accounts for them.
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

## Value / mean-reversion sleeve

A deliberately **separate, opt-in** second mandate (`strategy: "value"`). It is
**not** a loosening of the trend rules — it is a different game with its own
criteria, judged by its own red-team lens. The **hard risk rails are shared and
unchanged** (≤ 2% risk, ≤ 20% size, the sector + concurrency caps, the
6-order/day cap, a stop on every entry, marketable-limit, reward/risk ≥ 2:1).

**Fundamentals LEAD here** — the one deliberate exception to "technical-primary."
A value proposal should clear these:

1. **Quality (checkable bars, not vibes)** — a profitable, durable business with a
   sound balance sheet, not a broken company under a bid. This is the **primary**
   driver (fundamentals carry the thesis here, not price/trend), and it is
   **quantified + code-enforced** — computed by `assessCashFlowQuality` /
   `assessDividendFloor` and surfaced to the value red-team, which treats a failed
   bar as a value-trap flag:
   - **Free cash flow:** positive and non-declining. Negative or declining FCF is
     a value-trap flag.
   - **Leverage:** manageable — **D/E ≤ 2** (`debtToEquityHeavy`) and **interest
     coverage ≥ 3×** (`interestCoverageWeak`). Suppressed for financial-sector
     names, where high leverage is by design (not a solvency signal).
   - **FCF yield:** a clean floor clears **≥ 3%** (`fcfYieldHealthy`); unknown is
     unverified, not a free pass.
   - **Dividend (if paid):** FCF-covered (**≥ 1.2×**, `fcfCoverageHealthy`), payout
     not stretched (**≤ 100%**, `payoutRatioStretched`), and **not recently cut**
     (a negative dividend CAGR — a shrinking dividend — is a value-trap flag).
2. **Discount** — genuinely cheap vs its own history / peers (P/E, etc.) and/or
   near a multi-year or 52-week low. The discount is the edge.
3. **Catalyst or floor — why now** — a real reason the bleeding stops: a dividend
   support / hike, an analyst-target floor, insider buying, fundamental
   stabilization, **or** a technical mean-reversion signal (oversold RSI,
   long-term support, capitulation volume, basing). **"It's just cheap" with no
   catalyst or floor is a value trap** — flagged weak.
4. **Mean-reversion stop** — below a defined support / recent low; sized so the
   stop costs ≤ 2% of equity, reward/risk ≥ 2:1 (the shared rails).

**Counter-trend is expected.** Being below the 50-/200-day moving averages, in a
downtrend, or making lower lows is **normal** for a value entry and is **NOT** a
reason to reject — that would be applying the wrong mandate. The **value
red-team** therefore *expects* counter-trend and instead hunts **value-trap**
signals: deteriorating fundamentals (falling revenue / margins, cut guidance,
slashed targets), no real catalyst or floor, a falling-knife / broken business,
or an unrealistic target. A `fundamental` profit target is **appropriate** for
this sleeve (not weak); a sell-side `analyst_price` target is still weak.

**Where value proposals come from:** the discovery run when the human enables the
value sleeve (a discovery setting, off by default), and the manual
**analyze-a-symbol** tool when the human picks the **Value** lens.

## Position / mid-term sleeve

A **weeks-to-quarters** position trade (`sleeve: "position-mid"`) that **blends
trend with fundamentals** — longer-horizon than a swing, shorter than a core
hold. The **hard risk rails are shared and unchanged** (≤ 2% risk, ≤ 20% size,
the sector + concurrency caps, the 6-order/day cap, a stop on every entry,
marketable-limit, reward/risk ≥ 2:1). Judged by its own red-team lens. A mid
proposal should clear these:

1. **Multi-week thesis** — a sound weeks-to-quarters trend + fundamental case
   stands on its own; an immediate momentum trigger (a fresh breakout, a same-day
   volume spike) is **not** required. Do not reject for "no momentum right now."
2. **Fundamentals may lead** — a valuation / earnings-inflection / re-rating
   rationale is **in mandate**, and a `fundamental` target is **appropriate**. A
   sell-side `analyst_price` or an unspecified target is still weak.
3. **Earnings inside the window is tolerated** — a hold will often span an
   earnings date; that is expected here (unlike a swing) and is **not** an
   automatic disqualifier — size around it, **unless** it is an **imminent binary**
   whose downside exceeds the position's risk.
4. **Trend + stop still matter** — the multi-week trend must be intact (a broken
   structure, not a mere pullback, is a strike), with a defined stop sized to the
   shared rails (≤ 2% risk, reward/risk ≥ 2:1).

**Still prosecuted:** a broken multi-week trend, a deteriorating fundamental story
(falling revenue / margins, cut guidance, slashed targets), an imminent binary
that exceeds the risk, or a loose target / thin reward/risk.

## Long-term / core sleeve

A **multi-year buy-and-hold allocation** (`sleeve: "core-long"`), sized to a
**target weight** and governed by a **wide review trigger** rather than a
protective stop. It is an *allocation*, not a swing trade — judge it under the
right criteria. The shared **account-level** rails still apply (concurrency,
6-order/day cap, drawdown halt, emergency stop), but this sleeve is **no-stop by
design**. A core proposal should clear these:

1. **Durable quality** — a genuinely durable business, or a low-cost diversified
   fund — **not** a speculative narrative dressed up as "core." Thesis drift / a
   story stock is a strike.
2. **Sensible entry vs long-term value** — buying a good asset at a **rich price**
   (expensive vs its own history / a reasonable long-horizon valuation) is a real
   objection. Counter-trend and no near-term catalyst are **normal** and are
   **not** reasons to reject.
3. **Sizing by target weight + review trigger** — sized to a target portfolio
   weight (within the sleeve cap) and reviewed on a wide drawdown trigger. A
   missing stop / profit target is **by design** — do not cite it as a flaw.
4. **Concentration + (for a fund) cost** — respect the target allocation
   (over-concentration is a strike); for an ETF/index, the **expense ratio**,
   tracking error, and structure/liquidity must be sound (a high fee compounds
   against the holder for years).

**Still prosecuted:** overpaying vs long-term value, thesis drift / a story stock,
over-concentration vs the target allocation, poor fund quality (high expense
ratio, weak tracking), or an unrealistic long-term return assumption. A
`fundamental` (or, for a fund, a sensible long-horizon) target is **appropriate**;
a core ETF/index may legitimately have **no** price target — that is not weak.

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

- **2026-07-02** — **Quantified the value-sleeve quality bars + a dividend-cut
  flag.** The value **Quality** checklist item was vague ("sound balance sheet");
  it now enumerates the concrete, code-enforced bars (positive/non-declining FCF,
  D/E ≤ 2, interest coverage ≥ 3×, FCF yield ≥ 3%, and — for a payer — FCF-covered
  ≥ 1.2×, payout ≤ 100%, not recently cut), mirroring `CASH_FLOW_THRESHOLDS` /
  `DIVIDEND_THRESHOLDS`. Added a **dividend-cut** value-trap bar in code
  (`assessDividendFloor`: a negative dividend CAGR is at-risk). Quality now has
  teeth — checkable + surfaced to the value red-team, not the LLM's vibe.
- **2026-07-02** — **Enumerated the Position (mid-term) and Core (long-term)
  sleeve checklists.** The two sleeves were prose sketches; they now have explicit
  numbered checklists matching the trend/value style, mirroring the prosecutor's
  mid/core mandate guidance. Also added both lenses to the Strategy page's
  red-team rules view (`red-team-rules.ts` — previously only shared/trend/value,
  so the two sleeve lenses were invisible despite the "read live from the
  prosecutor's logic" claim), guarded by a drift test that fails if a sleeve lacks
  a rules section. Jargon in that view now carries a glossary tooltip. No rail or
  criterion changed — this is documentation + surfacing.
- **2026-06-26** — **Value / mean-reversion sleeve (value-sleeve M1).** Added the
  **Value / mean-reversion sleeve** section — a deliberately separate, opt-in
  second mandate (`strategy: "value"`) with its own entry checklist (Quality,
  Discount, Catalyst-or-floor, Mean-reversion stop) where **fundamentals lead**
  and **counter-trend is expected**. Noted under Strategy identity that every
  proposal carries a `strategy` and the trend checklist above is the default
  (`trend`) mandate. The two mandates are never merged; the **hard risk rails are
  shared and unchanged**. The detail-modal checklist + the red-team lens now adapt
  to the proposal's strategy. See `planning/value-sleeve-and-catalyst-spec.md`.
- **2026-06-25** — **Catalyst requirement (strategy coherence M3).** Promoted
  the **Catalyst & timing** checklist item from "avoid binary events" to a
  positive **requirement**: every proposal must name a catalyst (`catalyst` +
  `catalyst_type`); a `none` / trend-alone entry is flagged **weak** by the
  checklist + red-team. Proposals now carry both fields (surfaced on the
  proposal card). See `planning/strategy-coherence-spec.md`.
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
