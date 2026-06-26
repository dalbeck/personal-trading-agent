# Trading Charter

The immutable constitution for the agent. Every routine and proposal must
comply; the hard-coded risk engine (`lib/risk/`) and the red-team prosecutor
enforce it. **The agent may never edit this file or override a rule** — changing
the charter is a deliberate human act, recorded in the change log below.

> **Scope & focus.** The desk's **primary mandate is the live Robinhood
> account**: research, vet (risk rails + red-team), and **propose trades the
> human approves per trade**, placed in Robinhood once the **two gates** are open
> (a deliberate human action the agent cannot perform). The Alpaca **paper** desk
> is **secondary** — the proving ground and the gate-closed **dry-run sink** that
> an approved order routes to until the gates open. It is plumbing, not the
> focus. The app **never auto-trades**; hands-off automation (no human in the
> loop) remains gated on a passing Phase 2 evaluation scorecard.

## Analytical identity

**This is a technical, trend-following desk.** Technical evidence — trend,
momentum, relative strength, volume, and price structure — drives every
**entry, exit, and sizing** decision, and the profit target is always
**technically anchored** (prior high, measured move, or ATR multiple).

**Fundamentals (Perplexity research) serve one defined role: a catalyst check
and a disqualifier — never the primary entry rationale, and never the source of
the price target.** Concretely, fundamentals may only:

- supply or confirm the **named catalyst** behind a move, and
- **disqualify** an otherwise-clean technical setup — a value trap (deteriorating
  fundamentals under a bid) or an **imminent earnings binary** inside the holding
  window.

A thesis whose *primary* rationale is fundamental or valuation ("cheap on
earnings," "undervalued vs. peers") is **out of mandate**; the red-team
prosecutor penalizes it. Likewise a sell-side **`analyst_price` target is weak /
disqualifying** — the desk sets its own technical target, it does not borrow an
analyst's number (reinforced under Execution quality and the playbook Target
rule).

### Strategy mandates — trend (primary) and a value sleeve (opt-in)

Every proposal carries a **`strategy`** it is judged under, and the red-team is
briefed with the **matching** mandate. The two are **never merged into one
red-team** — then neither would be enforced.

- **`trend` (primary, default).** Everything above: technical evidence leads;
  fundamentals are a catalyst-check / disqualifier only.
- **`value` (a deliberate, separate sleeve).** A value / mean-reversion mandate
  for cheap, quality businesses near multi-year lows with a real catalyst or
  floor. It is the **one deliberate exception** to "technical-primary":
  **fundamentals LEAD** here, and **counter-trend is expected** — being below
  the moving averages is *normal*, not a strike. Its red-team **expects**
  counter-trend and instead hunts **value-trap** signals (deteriorating
  fundamentals, no real catalyst/floor, a falling-knife/broken business, an
  unrealistic target). It is **opt-in** — the trend desk remains primary; the
  value sleeve is enabled deliberately (a discovery setting / a manual
  analyze-a-symbol lens), not the default.

**The hard risk rails below are shared and unchanged across both mandates** (per-
position risk, size, sector, concurrency, daily-order cap, drawdown halt,
stop-on-every-entry, marketable-limit). Only the *entry-thesis criteria* and the
*red-team lens* differ — never a rail.

## Universe

- Listed **US equities only**. **No options, no crypto, no futures, no margin.**
- Fractional shares allowed.
- Minimum average daily dollar volume: **$50M** (liquidity floor).
- Exclude names failing the volatility filter (20-day ATR above the universe cap).
- **SPY is the benchmark, not a holding** — it is used to measure relative
  performance and as an emergency-stop signal, never bought as a position.

## Risk rails (hard gates)

These are enforced in code before any order can be placed. A proposal that
breaches any rail is **rejected and journaled**, not downsized silently. The LLM
cannot override them.

- **Per-position risk:** at most **2%** of equity at risk to the protective stop.
- **Per-position size:** at most **20%** of paper equity in any single name.
- **Sector concentration:** at most **40%** of equity in any single sector, so a
  5-position book can't quietly become three correlated names. Enforced when the
  sector is known; an unknown sector never causes a false block (fails open).
- **Concurrent positions:** at most **5** open positions at once.
- **Daily order cap:** at most **6** orders per day.
- **Drawdown halt:** at a **−10%** drawdown from the account high-water mark,
  halt all new risk (no new buys) until a human reviews.
- **Emergency stop (no new buys):** if **SPY is down −2% intraday** or **VIX > 30**,
  open no new positions for the session. Existing stops still stand.
- **Stop on every swing:** every entry carries a predefined protective stop, set
  at decision time. The stop is the **tighter of a fixed −8% and an ATR-based
  level** (the one nearer the entry wins), so the sizing math is deterministic —
  not left to discretion (`resolveStopPrice`, `lib/risk`).
- **Winner-exit discipline:** every entry also defines how it takes profit — a
  **profit target OR a trailing-stop rule**, set at decision time. The desk
  governs winners, not just losses.

## Live pilot caps (Phase 3 — real money)

Additional, **live-only** guardrails for the funded Robinhood Agentic account,
on top of the risk rails above. They bound the controlled live pilot and are
enforced in code (`lib/server/live-guards.ts`, mirrored in `charter.config.ts`).
The agent can never raise them; both gates plus per-trade approval still apply.

- **Weekly funding cap:** at most **$100** of human deposits into the live
  account per rolling 7 days. The agent never funds — this guards the human's
  own deposits and is surfaced on the dashboard.
- **Account exposure ceiling:** at most **$500** of total live exposure across
  all positions. An order that would breach it is **rejected and journaled**.
- **Live drawdown kill switch:** at a **−10%** drawdown from the live
  high-water mark, halt all new risk (latch live OFF via disconnect) and fire a
  phone/dead-man alert. Re-arming is a deliberate human act.

## Discovery caps (Phase 3 — autonomous idea generation)

Bounds on what a single research/discovery run may produce. Mirrored in code
(`charter.config.ts` `DISCOVERY_LIMITS`). Discovery output is always **review
candidates, never auto-acted** — the human places every trade — and auto-added
watchlist symbols are **tracking-only** (no order, no execution path).

> **These are a review-funnel PREFERENCE, not a safety rail.** They shape the
> *size and mix of the review queue*, and are **decoupled from — and far more
> generous than — the hard `maxOrdersPerDay` rail (6, unchanged).** A larger
> funnel of candidates never loosens execution: every proposal, of every
> conviction tier, still clears the risk rails **and** the red-team prosecutor,
> only **≤6 orders a day** can ever be placed, and discovery output stays
> review-only. The human tunes the funnel preferences (idea cap, per-sector cap,
> minimum conviction to surface) from the Risk-settings discovery panel, bounded
> by the hard ceilings below; the agent can never raise the ceilings.

- **Idea cap (`DISCOVERY_IDEA_CAP`):** a single run surfaces up to **~20** ranked
  trade ideas by default (the human may tune this, up to a hard ceiling of
  **40**). This is the *review-funnel* cap — **separate from the 6-order/day hard
  rail** — so the desk casts a wide net and the human chooses. Never a quota: the
  run never fabricates filler when genuine setups don't exist.
- **Best-in-sector / per-sector cap:** at most **3** proposals from any single
  sector per run, and the run aims to represent **≥3 sectors** when the setups
  exist, so the queue is a sector-diversified mix rather than one hot sector.
  This is a trend / relative-strength desk, so diversification means the
  *strongest setup within each sector*, never buying laggards.
- **Conviction tiers:** every idea is scored and tagged **`high` / `moderate` /
  `watch`**; the queue **sorts strongest-first but shows all tiers by default**
  (the tier drives sort + an optional filter, never hiding by default).
- **Watchlist ceiling:** the tracked universe's watchlist holds at most **20**
  symbols; discovery auto-adds stop at the ceiling. The human can prune freely.

## Execution quality

- **Marketable-limit orders only.** Never a naked market order, and never a
  stop-market that can slip without bound.
- Every entry is recorded with its stop, target, and review date at decision time.
- Time horizon: **swing/position** (days to months). No intraday scalping.

## Governance

- Every proposed trade passes the risk rails **and** a cross-model red-team
  prosecutor (different model family, defaults to "no") before it can be placed.
- Each trade and each rejection is written to the decision journal at decision
  time; rejections record the blocking rule or the prosecutor's reasoning.
- **Live execution is human-approved, per trade.** Every live order requires an
  explicit human approval at decision time; the app never auto-trades. It can
  only reach Robinhood once **both gates** are open (`assertLiveOrderAllowed`
  fails closed); the agent can open neither gate nor grant itself order
  permission. Until then, an approved live order routes to the dry-run sink.
  Hands-off automation stays gated on the Phase 2 scorecard.

## Benchmark & goal

- Measured **benchmark-relative vs. SPY** under the risk rails above.
- The goal is **risk-adjusted outperformance with controlled drawdowns**, not a
  fixed weekly return target.

## Change log

Every edit to this charter is dated and reasoned. Newest first.

- **2026-06-26** — **Value / mean-reversion sleeve (value-sleeve M1).** Authorized
  a **second strategy mandate**. Every proposal now carries a **`strategy`**
  (`trend` | `value`) and is judged under the matching red-team lens. **`trend`
  stays primary and the default**; **`value`** is a deliberate, **opt-in** value /
  mean-reversion sleeve — the **one exception** to "technical-primary," where
  **fundamentals lead** and **counter-trend is expected** (below the moving
  averages is normal, not a reject reason). The value red-team **expects**
  counter-trend and hunts **value-trap** signals instead (deteriorating
  fundamentals, no real catalyst/floor, a falling-knife/broken business, an
  unrealistic target); the two red-teams are **never merged**. The sleeve is
  enabled deliberately — a discovery setting (`valueSleeveEnabled`, off by
  default) and a manual analyze-a-symbol **lens** picker. Added the **Strategy
  mandates** subsection above. **No hard rail or cap changed** (`charter.config.ts`
  risk rails untouched): the per-position/size/sector/concurrency rails, the
  **6-order/day** cap, the drawdown halt, stop-on-every-entry, and marketable-limit
  are **shared and unchanged** across both mandates — only the entry-thesis
  criteria and red-team lens differ. Rationale: names that are correctly rejected
  *as trend trades* (counter-trend, below declining MAs) deserve a fair hearing
  under value criteria, instead of forcing the trend red-team to loosen. See
  `planning/value-sleeve-and-catalyst-spec.md`.
- **2026-06-26** — **Diversified-discovery funnel (proposal-gen M1).** Decoupled
  the discovery **idea cap** from the daily ORDER cap and made it a generous,
  human-tunable **review-funnel preference** rather than a safety rail: a single
  run now surfaces up to **~20** ranked ideas by default (hard ceiling **40**),
  spread **best-in-sector** across sectors (≤**3** per sector, ≥**3** sectors
  targeted) and tagged by **conviction tier** (`high` / `moderate` / `watch`,
  sorted strongest-first, all tiers shown by default). The owner is **explicitly
  authorizing the larger funnel** — more opportunities surfaced, the human
  filters only if overloaded. Mirrored in `charter.config.ts` (`DISCOVERY_LIMITS`
  → `ideaCap` 20 / `maxIdeaCap` 40 / `maxProposalsPerSector` 3 / `minSectorsTarget`
  3 / `maxWatchlistSymbols` 20), tripwired by `charter-config.test.ts`. **No hard
  rail or cap changed:** the **6-order/day** rail, the risk rails, and the
  red-team gate are untouched — every candidate of every tier still clears them,
  and only ≤6 orders a day can ever be placed. Rationale: a wider, ranked,
  sector-diversified net surfaces more real setups without weakening any
  execution boundary. See `planning/proposal-generation-enhancement-spec.md`.
- **2026-06-25** — **Analytical identity declared (strategy coherence M1).**
  Added the **Analytical identity** section stating plainly that this is a
  **technical trend-following desk**: technical evidence drives entry, exit,
  sizing, and the (technical) target, while **fundamentals serve only as a
  catalyst-check and disqualifier** — never the primary entry rationale, never
  the price-target source. Reinforced that a sell-side `analyst_price` target is
  weak/disqualifying. The red-team prosecutor now penalizes a fundamental- or
  valuation-primary thesis (on top of flagging analyst-price targets). No
  risk-rail or cap numbers changed (`charter.config.ts` untouched); this raises
  proposal **quality** only — no gate or execution change. See
  `planning/strategy-coherence-spec.md`.
- **2026-06-25** — **Target & sector governance (pre-live polish M3).** Added a
  **sector-concentration rail** (≤ **40%** of equity per sector, mirrored in
  `charter.config.ts` `maxSectorWeightPct`, tripwired by `charter-config.test.ts`)
  so a 5-position book can't be three correlated names; it fails open on an
  unknown sector. Added **winner-exit discipline** (every entry defines a profit
  target or a trailing-stop rule) as a hard rail. Codified the **stop-priority
  rule**: the protective stop is the *tighter* of a fixed −8% and an ATR-based
  level, so sizing is deterministic (`resolveStopPrice`). Proposals now carry a
  required `targetType` (`prior_high | measured_move | atr_multiple | fundamental
  | analyst_price`); an `analyst_price` (sell-side) target is flagged weak by the
  checklist/red-team. Rationale: the GE proposal review exposed loose targets and
  hidden correlation; bound them in code + the playbook. Other rail numbers
  unchanged.
- **2026-06-25** — **Live-first reorientation.** Made the **live Robinhood
  account the desk's primary mandate** and demoted the Alpaca paper desk to the
  secondary proving ground + gate-closed dry-run sink (plumbing, not the focus).
  No risk-rail or cap numbers changed (`charter.config.ts` untouched); the
  safety model is unchanged — the app never auto-trades, every live order is
  human-approved per trade, and the two gates stay human-only. Rationale: the
  owner wants the desk working against the real account, not proving itself on
  paper. See `planning/live-first-reorientation-spec.md`.
- **2026-06-25** — Reframed **scope** for **human-approved live execution**: the
  autonomous desk still trades paper only, but live (Robinhood) orders are now
  permitted **when a human approves each one** and **both gates are open** — the
  app never auto-trades, and the agent can open neither gate. Hands-off
  automation stays gated on the Phase 2 scorecard. Added the matching Governance
  bullet. No risk-rail or cap numbers changed (`charter.config.ts` unchanged).
  Rationale: the owner wants the human to be the per-trade decision-maker
  (propose → approve → place) rather than executing every live trade by hand;
  the two-gate + per-trade-approval safety model is unchanged. See
  `planning/live-execution-spec.md`.
- **2026-06-25** — Added the **Discovery caps (Phase 3)** section: at most **6**
  new proposals per discovery run (tracks the daily order cap) and a **20**-symbol
  watchlist ceiling for auto-added discovery candidates. Mirrored in
  `charter.config.ts` (`DISCOVERY_LIMITS`), tripwired by `charter-config.test.ts`.
  Rationale: bound autonomous idea generation in code so a scan can't flood the
  review queue or the tracked universe; discovery output stays review-only and
  watchlist auto-adds are tracking-only (no execution path).
- **2026-06-24** — Added the **Live pilot caps (Phase 3)** section: a **$100**
  weekly funding cap, a **$500** account exposure ceiling, and a **−10%** live
  drawdown kill switch. These are live-only guardrails for the funded Robinhood
  account, mirrored in `charter.config.ts` (`LIVE_LIMITS`) and enforced in
  `lib/server/live-guards.ts`. Paper rails unchanged. Rationale: bound the
  controlled live pilot in code before any real-money milestone (M5) is gated in.
- **2026-06-24** — Aligned the risk rails to the Phase 2 build spec (the binding
  source): per-position size cap 15% → **20%**, daily order cap 5 → **6**,
  drawdown halt −8% peak-to-trough → **−10% from the high-water mark**. Added
  the **5 concurrent-position cap**, the **SPY −2% / VIX > 30 emergency stop**,
  and this change-log discipline. Per-position risk stays at 2%; execution and
  universe rules unchanged. Rationale: adopt the conservative defaults the desk
  will be measured against before the autonomous routines begin writing at volume.
