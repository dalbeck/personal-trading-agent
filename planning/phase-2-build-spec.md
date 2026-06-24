# Phase 2 Build Spec — Autonomous routines + governance (PAPER ONLY)

_Executable spec for a local Claude Code session. Read `AGENTS.md` + `.agents/*.md` and `planning/architecture.md` first. **Everything in this phase runs on Alpaca paper. No real money. No Robinhood. No order placement to a live brokerage.**_

## Outcome
A self-running paper-trading desk: scheduled headless routines research the market, propose swing trades, run them past a cross-model red-team and hard-coded risk rails, place **paper** orders, and journal + self-coach every decision. Proven over an evaluation window and benchmarked vs. SPY before Phase 3 is even considered.

## Decisions to confirm (defaults below — change before building if you disagree)
- **Model tiering:** routine daily passes = **Sonnet**; red-team = **Codex** (different family, default-"no" prosecutor); weekly review + escalations = **Opus**. Optional local news scout = a small local model.
- **Cadence (ET, weekdays):** pre-market research ~08:00 · open execution ~09:35 · midday scan ~12:30 · EOD summary ~16:15 · weekly review Sun ~17:00.
- **Risk rails (starting, conservative — tune in `charter.md`):** per-position cap ≤20% of paper equity; max 5 concurrent positions; ≤6 orders/day; halt new risk at −10% from account high-water; emergency stop (no new buys) if SPY −2% intraday or VIX > 30; a stop on every swing (e.g. −8% or ATR-based); marketable limit orders only; no options/crypto/margin; equities only (SPY used as **benchmark**, not held).
- **Research provider:** default **OFF**. Optional **Perplexity `finance_search`** adapter (metered Agent API, capped) for fundamentals/earnings/catalyst context — opt in via M8. Not the Pro app subscription.

## Milestones (each = feature branch + PR)

### M1 — `feature/governance-files`
- `strategy/charter.md` — the immutable constitution: universe, the risk rails above, execution-quality rules (marketable limit orders, never naked market orders), and the change-log discipline (every edit dated + reasoned).
- `strategy/playbook.md` — pre-trade checklist (trend / momentum / relative strength, volatility, catalyst, sizing) + a "banked lessons" section that grows over time.
- **Acceptance:** files exist, are loaded by the engine, and the charter's numeric limits are mirrored in a machine-readable config (M2).

### M2 — `feature/risk-engine`
- `lib/risk/` loads charter limits from a typed config (`strategy/charter.config.ts` or JSON) and exposes **pure validator functions** that gate every proposed order *before* it can be placed: size cap, position-count cap, daily-order cap, drawdown halt, emergency-stop conditions, stop-attached check, allowed order-type check, universe check.
- These are **hard gates**. A failing order is rejected and journaled as a rejection. The LLM cannot override them — enforced in code, not prompt.
- **Acceptance:** thorough unit tests (boundary cases for each rule) pass; a violating order is provably blocked and logged.

### M3 — `feature/journal-and-coaching`
- Implement the writers using the Phase 1.5 format (MD+frontmatter for narrative, JSON for structured):
  - **Decision journal:** one entry per trade **and** per rejection, at decision time — thesis, research summary, red-team verdict, decision + why, review date.
  - **Coaching log:** next-morning self-review grading prior calls against actual prices; may promote a durable lesson into `playbook.md` (logged).
- **Acceptance:** routines emit well-formed artifacts; the dashboard renders them via the Phase 1.5 renderer; a promoted lesson appears in `playbook.md` with provenance.

### M4 — `feature/red-team-gate`
- After the primary model proposes a trade, invoke a **different model family** (`codex exec`) as a hostile prosecutor instructed to refute the thesis and **default to "no."** Record its verdict + reasoning. A "no" blocks the trade (or forces a downsize, per policy). The value is the adversarial pressure, not a second opinion.
- **Acceptance:** every proposed trade carries a recorded red-team verdict; blocked trades are journaled as rejections with the prosecutor's reasoning.

### M5 — `feature/scheduled-routines`
- Prompt files in `routines/` (one per routine) + a **launchd**-based scheduler (plists in `scripts/`, since this runs natively on the Mac) that invokes headless `claude -p` / `codex exec` sessions on the cadence above.
- The five routines: pre-market research, market-open **paper** execution, midday scan, EOD summary, weekly review.
- Single-instance **lockfile** (atomic + stale-timeout) so a duplicate/manual run can't trade over a scheduled one. Structured run logs to `data/logs/`.
- **Acceptance:** routines fire on schedule, run end-to-end on paper, respect risk rails + red-team, and write journals/snapshots/logs. A duplicate fire is blocked by the lock.

### M6 — `feature/reliability`
- **Dead-man switch** (healthchecks.io or equivalent): each routine pings on completion; a stalled/missed run raises an external alert.
- **Heartbeats to phone** (ntfy / Pushover) on routine start/finish and on any blocked order.
- **Watchdog** to restart the optional news scout if it dies.
- **Acceptance:** a simulated stalled run triggers an alert on a separate channel; heartbeats arrive; killing the scout auto-restarts it.

### M7 (optional) — `feature/news-scout`
- An always-on **local** model pulling public RSS (MarketWatch/CNBC/Yahoo, etc.) and triaging each headline against the current paper book — material or not, and to which holding — so only relevant events reach the research/red-team steps.
- **Acceptance:** scout runs continuously, triages headlines against the book, and surfaces only material items. Skip if you don't want a local model running.

### M8 (optional) — `feature/research-provider`
- Define a swappable **`ResearchProvider`** interface in `lib/research/` so the research step can use Perplexity, plain web search, or nothing. Default **off** (`RESEARCH_PROVIDER=off`) — with it off, the desk runs exactly as without this milestone.
- **Perplexity adapter:** calls the Agent API `finance_search` for fundamentals / earnings / analyst / catalyst context. Use the cheap config (`model=sonar`, `max_steps=1`, small `max_output_tokens`). Normalize results to JSON the research routine ingests.
- **Hard cost guardrails:** a per-day invocation cap (`PERPLEXITY_DAILY_CALL_CAP`, default 30) enforced **in code** — once hit, refuse further calls and log it. Only the **pre-market research** routine may call it, and only for the shortlist / tickers with upcoming earnings — never every ticker on every routine.
- **Boundaries:** research only — **never** used for order pricing or execution (Alpaca is the source of truth). Recorded in `.agents/infra.md` as the single sanctioned metered-API exception. This is the pay-as-you-go Agent API, not the Perplexity Pro app.
- **Evaluation hook:** tag journal entries that used Perplexity context, so you can later assess whether it actually improved decisions and disable it if not.
- **Acceptance:** with `RESEARCH_PROVIDER=perplexity` + a key, the pre-market routine enriches research with `finance_search` and provably blocks call N+1 past the daily cap; with `off`, zero API calls occur and behavior is unchanged.

## Definition of done
- The paper desk runs autonomously across a defined **evaluation window** (recommend ≥ 6–8 weeks).
- Performance is tracked **vs. SPY**; the decision journal + coaching log are complete and honest (rejections included).
- A written go/no-go assessment: did the paper desk repeatably beat the benchmark, with controlled drawdowns? **This is the gate to Phase 3.**

## Out of scope (do NOT build)
- Any real-money order, Robinhood connection, or live brokerage call (Phase 3).
- Options, crypto, futures, margin.
