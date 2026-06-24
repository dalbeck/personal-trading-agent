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

- **2026-06-24** — Aligned the risk rails to the Phase 2 build spec (the binding
  source): per-position size cap 15% → **20%**, daily order cap 5 → **6**,
  drawdown halt −8% peak-to-trough → **−10% from the high-water mark**. Added
  the **5 concurrent-position cap**, the **SPY −2% / VIX > 30 emergency stop**,
  and this change-log discipline. Per-position risk stays at 2%; execution and
  universe rules unchanged. Rationale: adopt the conservative defaults the desk
  will be measured against before the autonomous routines begin writing at volume.
