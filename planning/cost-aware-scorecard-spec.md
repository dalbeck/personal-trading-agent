# Build Spec — cost-aware paper evaluation scorecard (go/no-go before real money)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/infra.md`, `.agents/data-format.md`, the existing evaluation/scorecard code, and `strategy/charter.config.ts` first. Follow the git rules in `.agents/workflow.md` — each milestone = its own branch + PR, pause after each._

## Why
The owner is deciding whether the app's run-cost (FMP $228/yr + metered Perplexity ≈ **$300/yr all-in**) is justified. "Profitable" is the wrong bar — the strategy must beat what the same capital earns **passively (SPY), net of the real costs the live version would incur.** Today's scorecard reports paper P&L but does NOT (a) subtract modeled API + trading-friction costs, or (b) render an explicit, threshold-based **pass/fail** verdict vs. benchmark. This spec makes the scorecard **cost-aware and decision-oriented** so a few months of paper trading produces a clean yes/no.

The output is informational only — it changes no trade gate. Funding + opening the live gates stay human-only (see `planning/two-gate-live-trading.md`).

## M1 — `feature/scorecard-cost-model` (model the all-in drag)
Build a single cost model that converts the app's real run-cost into a return drag over the evaluation window:
- **Fixed API cost (FMP):** amortize the configured annual subscription across the window (e.g. $228/yr → per-day → × window days). Make the annual figure a config value (`EVAL_FIXED_API_COST_ANNUAL_USD`, default 0 = free tier) so it's honest when unpaid.
- **Metered API cost (Perplexity):** sum the **actual** per-call cost already logged in `data/research/diagnostics.json` over the window (don't estimate — the real billed amounts are there).
- **Trading frictions:** model per-fill cost even though Alpaca/Robinhood commissions are $0 —
  - **Spread/slippage:** marketable-limit orders cross the spread. If actual fill-vs-mid is available from the paper fills, use it; otherwise apply a conservative per-side bps assumption (config `EVAL_SLIPPAGE_BPS`, default ~5 bps each way for liquid large-caps).
  - **Commissions:** include an explicit `$0` line (config) so the model is complete and future-proof if a broker changes.
- **Output:** a `CostModel` that returns total $ cost and a cost-as-% -of-capital drag for any window, broken out by line (fixed API / metered API / slippage / commission).
- **Acceptance:** given a window with known diagnostics + fills, the cost model returns the correct itemized total; unit-tested with a fixture window; free-tier config yields $0 fixed API cost.

## M2 — `feature/scorecard-benchmark-relative` (strategy vs SPY, net of cost)
Extend the scorecard to report **benchmark-relative, net-of-cost** performance:
- **Returns:** strategy cumulative + annualized return, **gross and net of the M1 cost model**.
- **Benchmark:** SPY total return over the **same window** (buy-and-hold, using the benchmark closes already pulled via `ALPACA_DATA_URL`). 
- **Excess return (the headline number):** `net strategy return − SPY return`, annualized. This is the only number that answers "is this worth doing." Show it prominently with sign + color.
- **Risk-adjusted:** Sharpe (or return/volatility if risk-free is omitted), max drawdown for **both** strategy and SPY over the window, and Sortino (optional).
- **Process stats:** closed-trade count, win rate, avg win / avg loss, profit factor, avg holding period, and a **risk-rail adherence** line (count of any breaches of the ≤2%/position, ≤20% size, ≤5 positions, ≤6 orders/day rails — expected 0).
- **Acceptance:** the scorecard shows strategy gross, strategy net-of-cost, SPY, and net excess return over the window, all annualized; max drawdown for strategy vs SPY; trade stats + a zero-breach adherence line; computed from real paper fills + benchmark closes; unit-tested against a fixture.

## M3 — `feature/scorecard-go-no-go` (the explicit verdict)
Render a single, unambiguous **GO / NO-GO / NOT-YET** panel so the decision isn't subjective:
- **Minimum sample gate:** verdict is `NOT-YET` until the window reaches a configurable floor (default: **≥ 3 months elapsed AND ≥ 20 closed trades**) — don't let a 2-week lucky streak read as GO.
- **Pass criteria (all configurable, no magic numbers in code):** once the sample gate is met, `GO` requires:
  1. **Net-of-cost annualized excess return vs SPY > 0** (beats passive after costs), by a configurable margin (default > 0).
  2. **Max drawdown ≤ SPY max drawdown** over the window (or ≤ a configurable cap) — didn't beat SPY by taking wild risk.
  3. **Zero hard-rail breaches.**
  Otherwise `NO-GO`, with the specific failing criterion named.
- **Surface it** on the Operations/Evaluation view: the verdict, the headline excess-return number, the cost breakdown, and the sample progress (`X/20 trades, Y/90 days`). A one-line plain-English summary (e.g. "NOT-YET — 11/20 trades; tracking +2.1% net excess annualized").
- **Acceptance:** with a fixture below the sample floor → `NOT-YET`; a fixture that beats SPY net-of-cost with acceptable drawdown + no breaches → `GO`; a fixture that's net-positive but trails SPY, or breaches a rail, or exceeds the drawdown cap → `NO-GO` naming the failed criterion; the verdict + cost breakdown render in the UI; tested per branch.

## After it lands
Run (or keep running) the paper desk and let the scorecard accumulate. The verdict answers the owner's actual question — _does the realized edge justify ~$300/yr of API cost at the intended capital_ — with $0 spent to find out. Re-read it before any FMP upgrade or live-funding decision.

## Out of scope
- Gate / hard-rail / execution changes; auto-funding; making the verdict *trigger* anything (it's advisory only). Real-money and FMP-subscription decisions stay human.
