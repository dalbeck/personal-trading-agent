# Trading Charter

The immutable constitution for the agent. Every routine and proposal must
comply; the hard-coded risk engine (`lib/risk/`) and the red-team prosecutor
enforce it. **The agent may never edit this file or override a rule** — changing
the charter is a deliberate human act, recorded in the change log below.

> **Scope: paper only.** Phase 2 runs entirely on Alpaca paper. No real-money
> order, no live brokerage, no Robinhood. Real money is Phase 3 and requires the
> separate two-gate human approval.

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
- **Concurrent positions:** at most **5** open positions at once.
- **Daily order cap:** at most **6** orders per day.
- **Drawdown halt:** at a **−10%** drawdown from the account high-water mark,
  halt all new risk (no new buys) until a human reviews.
- **Emergency stop (no new buys):** if **SPY is down −2% intraday** or **VIX > 30**,
  open no new positions for the session. Existing stops still stand.
- **Stop on every swing:** every entry carries a predefined protective stop
  (e.g. **−8%** or an ATR-based level), set at decision time.

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

Bounds on what a single research/discovery run may produce, so a scan can never
flood the review queue or the tracked universe. Enforced in code
(`charter.config.ts` `DISCOVERY_LIMITS`); the agent can never raise them.
Discovery output is always **review candidates, never auto-acted** — the human
places every trade — and auto-added watchlist symbols are **tracking-only** (no
order, no execution path).

- **Max new proposals per run:** at most **6** new trade ideas per discovery run
  (tracks the daily order cap so the queue can never exceed what a day could act
  on). Each still clears the risk rails and the red-team prosecutor.
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

## Benchmark & goal

- Measured **benchmark-relative vs. SPY** under the risk rails above.
- The goal is **risk-adjusted outperformance with controlled drawdowns**, not a
  fixed weekly return target.

## Change log

Every edit to this charter is dated and reasoned. Newest first.

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
