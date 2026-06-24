# Trading Charter

The immutable constitution for the agent. Routines and proposals must comply;
the red-team prosecutor enforces it. Changing this file is a deliberate human
act, not something the agent does on its own.

## Universe

- Listed US equities only. **No options, no crypto, no futures, no margin.**
- Fractional shares allowed.
- Minimum average daily dollar volume: $50M (liquidity floor).
- Exclude names failing the volatility filter (20-day ATR above the universe cap).

## Risk caps

- **Per-position risk:** at most **2%** of equity at risk to the protective stop.
- **Per-position size:** at most **15%** of equity in any single name.
- **Daily order cap:** at most **5** new entries per day.
- **Drawdown circuit breaker:** at a **−8%** peak-to-trough on the account,
  halt new entries and review.
- **Emergency halt:** any breach of these caps stops trading until a human
  clears it.

## Execution

- **Marketable-limit orders only.** No market orders, no stop-market that can
  slip without bound.
- Every entry carries a predefined protective stop and a review date.
- Time horizon: swing/position (days to months). No intraday scalping.

## Benchmark

- Measured **benchmark-relative vs. SPY** with the risk caps above.
- The goal is risk-adjusted outperformance, **not** a fixed weekly return target.
