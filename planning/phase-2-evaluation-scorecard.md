# Phase 2 Evaluation Scorecard — paper desk go/no-go

_Fill this at the end of the evaluation window. It is the gate to Phase 3. Track the inputs from day one so the assessment isn't reconstructed from memory. **This is not investment advice — it's a process rubric.**_

## Window setup
- Start date / end date: ______ → ______
- Trading days in window: ______ (target ≥ 30; ideally 6–8 weeks)
- Starting paper equity: ______
- Benchmark: **SPY**, same window, dividends-adjusted

## 1. Performance vs benchmark (the headline)
| Metric | Desk | SPY | Delta |
|---|---|---|---|
| Total return % | | | |
| Max drawdown % | | | |
| Return ÷ max-drawdown | | | |
| Volatility (daily stdev) | | | |
| Simple Sharpe (excess/vol) | | | |

**Excess return (alpha) = desk return − SPY return:** ______

## 2. Trade statistics
- Trades closed: ______  | Win rate: ______%
- Avg win %: ______ | Avg loss %: ______ | Profit factor (gross win ÷ gross loss): ______
- Avg holding period: ______ days | Largest win / loss: ______ / ______
- Proposals generated vs executed: ______ / ______ (selectivity)

## 3. Process integrity (must pass regardless of P&L)
- Rule violations that **bypassed** the risk engine: ______ (must be **0**)
- Orders blocked by risk rails: ______ | by red-team: ______
- Emergency-stop / circuit-breaker activations: ______ (and did they behave correctly?)
- Any order placed without an attached stop: ______ (must be **0**)
- Any real-money path touched: ______ (must be **0** — Phase 3 is separate)

## 4. Reliability
- Scheduled routines: runs expected vs completed: ______ / ______
- Missed/stalled runs (dead-man alerts fired): ______
- Single-instance lock conflicts: ______
- Heartbeats delivered as expected: yes / no

## 5. Behavioral / qualitative (from journal + coaching log)
- Recurring mistakes flagged: ______
- Lessons promoted into `playbook.md`: ______
- Is the journal honest about rejections and losers (not just winners)? yes / no
- Did the red-team meaningfully change outcomes, or rubber-stamp? ______

## Decision rubric
**GO to a capped Phase 3 pilot only if ALL of:**
- Positive **excess return** vs SPY, AND
- Max drawdown **no worse** than SPY by a margin you set in advance (e.g. ≤ +5pp), AND
- **Zero** process-integrity failures (section 3), AND
- Reliability acceptable (section 4), AND
- The edge looks like **process, not one lucky trade** (no single position drives most of the return).

**ITERATE (don't go live, adjust + re-run) if:** mixed — e.g. beat SPY but on one outlier, or process held but returns lagged.

**NO-GO (stop or rethink) if:** underperformed SPY, excessive drawdown, or any process-integrity failure.

## Honest caveats (read before acting on a "GO")
- **6–8 weeks is a small sample.** Beating SPY over one short window can easily be luck, not edge. A single favorable regime won't generalize. Consider extending the window or requiring a second passing window before going live.
- A "GO" still means **start Phase 3 tiny** (the ~$100/week cap), per-trade approval ON. The scorecard gates *whether* to pilot, not *how big*.
- Paper fills are optimistic — no real slippage/queue. Expect live results to be somewhat worse than paper for the same signals.
