# Personal Trading Agent — Feasibility, Costs & Plan

_Prepared June 23, 2026. Not investment advice. I am not a licensed financial advisor; this document evaluates tooling and feasibility only._

---

## TL;DR

- **The technical part is real and easy.** Connecting Claude Code or Codex to a brokerage that exposes an MCP server (Robinhood does; Fidelity does not) takes about 5 minutes. Analysis tooling like `tradingview-mcp` plugs in just as easily.
- **The hard part is making money, not wiring it up.** Automated day trading with $100–200/week of fresh capital is the single hardest way to use this technology. An LLM is a capable analyst and a competent plumber, but it has **no demonstrated trading edge**. The realistic expected outcome of small-account day trading is a slow loss, before you even count the cost of running the agent.
- **Fidelity is a dead end for automation.** No public retail trading API, no MCP. You can read/aggregate Fidelity data through third parties, but you cannot place automated trades there.
- **Robinhood Agentic Trading is the only turnkey "agent places the order" path** right now (launched May 27, 2026; equities-only beta). **Alpaca** is the better path if you want to build, backtest, and paper-trade properly before risking a cent.
- **Recommended approach:** build the analysis/decision engine against **Alpaca paper trading (free)**, prove it over 60–90 days with zero real money, and only then decide whether to route live orders — and even then, keep a human approval step. Treat this as a learning/automation project with a strict, capped "tuition" budget, not an income stream.

---

## 1. Evaluating the Reddit post

You pasted the full post (an "Update 1" to an earlier thread). It is **well above the usual standard** for this genre — not a "look, it traded 33 cents" novelty demo, but a thoughtfully engineered, multi-agent autonomous desk. Credit where due; it's worth taking seriously as an architecture reference.

**What the author actually built:**
- **Tiered multi-model roles:** Opus as "CEO/PM" (weekly review + escalations), Codex as an adversarial **red-team prosecutor** told to refute every trade and default to "no," a local **Gemma** model as an always-on news scout, and Sonnet for routine daily work. Models are tiered explicitly **for cost**.
- **Four governing `.md` files:** a **Charter** (immutable constitution — 50/50 barbell mandate, equities/ETFs only, no options/crypto/margin, stop on every swing, per-position cap, daily order cap, drawdown circuit breaker, emergency halt, marketable-limit orders only); a **Decision Journal** (one entry per trade *and* per rejection, written at decision time); a **Playbook** (pre-trade checklist + banked lessons); and a **Coaching log** (next-morning self-review that promotes durable lessons into the Playbook).
- **Real operational scaffolding:** scheduled headless sessions (morning loop, afternoon risk pass, Sunday review), a broker **MCP** with typed tools (`get_portfolio`, `place_equity_order`), a single-instance lockfile, a watchdog, an **off-laptop dead-man switch (healthchecks.io)**, and phone heartbeats. The author rightly notes this "unglamorous 80%" is what makes *autonomous* trustworthy.
- **The two-gate autonomy model** is the standout insight: (1) broker side — the Robinhood Agentic account allows agent trading; (2) harness side — Claude Code blocks real-money orders until a human does a **one-time, deliberate `settings.json` allow-list edit**, and the agent is **not allowed to grant itself that permission.** That human-turns-the-key-once design is exactly right.

**What it still does NOT show:** any **profit**. Per the comments, it's been live "since last Wednesday," conservatively, with bugs still being worked out — and the author plans to "crank it to swing for the fences" later. There is **no P&L, no benchmark vs. buy-and-hold, no fee/tax-adjusted track record.** One commenter's skepticism is sharp and worth heeding: the LLM hands everyone the *same* polished scaffold (charter/journal/watchdog), which can manufacture **false confidence** — impressive process is not the same as edge. The author's own log even documents the "CEO" overriding its own decision and the red-team later grading it a mistake. Good honesty; also a live example of the agent not following its own rules.

**Verdict:** An excellent **engineering** template — genuinely worth copying the structure (Charter, Decision Journal, red-team gate, dead-man switch, two-gate permissions). But it is still an unproven *strategy*. Borrow the architecture; do not assume the returns. The discipline it models (paper-prove before scaling, log every decision, hard guardrails, human-held kill switch) is the takeaway — and it maps almost exactly onto the phased plan in §7.

---

## 2. Evaluating `atilaahmettaner/tradingview-mcp`

**What it is:** An open-source MCP server that exposes TradingView's screener and technical-indicator data to an AI agent (Claude Desktop, etc.). It provides real-time crypto **and** stock screening, technical indicators (RSI, MACD, Bollinger Bands), and candlestick-pattern detection. Multi-exchange on the crypto side (Binance, KuCoin, Bybit).

**What it is NOT:** It does not connect to a broker and does not place orders. It is a **read-only analysis/data source** — the "eyes," not the "hands."

**Fit for your goal:**
- Useful as a **signal/screening input** to the agent: "find oversold large-caps with RSI < 30," "scan for bullish engulfing patterns," etc.
- Caveats: it relies on scraping/using TradingView's data, which can break when TradingView changes things, may bump rate limits, and its indicator values should be sanity-checked against a second source before you ever trade on them. It's a community project — pin a known-good commit, read the code before granting it anything, and don't assume uptime.
- **Role in the architecture:** one of several *analysis* tools feeding the decision layer. Pair it with a more reliable historical-data source (Alpaca, Polygon, or yfinance) rather than relying on it alone.

**Verdict:** Worth using as a screening/indicator plugin. Not a foundation — it's one optional sensor among several.

---

## 3. Broker / execution options

| Path | Auto-trading? | Cost | Notes |
|---|---|---|---|
| **Fidelity** (your main account) | **No** | — | No public retail trading API, no MCP. SnapTrade can *read* Fidelity data but **cannot place trades**. Confirmed June 2026 — not a realistic automation target. |
| **Robinhood Agentic Trading** | **Yes (turnkey)** | $0 MCP fee; commission-free equities | Paste one MCP URL into Claude Code/Codex. Agent gets **read access to all your RH accounts** but can only **trade in a separate, dedicated "Agentic" account** you fund. Per-trade notifications; optional manual approval before execution. Equities-only beta; options/crypto "coming soon." |
| **Alpaca** | **Yes (build-it-yourself API)** | $0 commissions; **free paper trading + real-time data** | Developer-first. The right tool for backtesting and paper trading. No MCP out of the box, but a documented REST API the agent can call. Best risk-free proving ground. |

**Key takeaways:**
- Keep Fidelity as your main investing account. It simply isn't part of the automation loop.
- Use **Robinhood's dedicated agentic account** as the eventual live-execution sandbox *if* you go live — its design (separate wallet, capped balance, notifications, disconnect-anytime) is exactly the right safety model for what you're describing.
- **Start on Alpaca paper trading** so you can prove a strategy with $0 at risk and real market data before touching the Robinhood path.

**Regulatory tailwind:** The **Pattern Day Trader rule was eliminated** — the SEC approved scrapping the $25,000 minimum (effective June 4, 2026; brokers phasing in through Oct 2027). Previously, 4+ day trades in 5 days required a $25k balance, which would have blocked a small-account day-trading plan outright. That barrier is now gone — you can day-trade a small account. **This removes the legal blocker but does nothing to change the math below.**

---

## 4. The honest math on $100–200/week day trading

This is the part most write-ups skip, so it's worth being direct.

- **Small-account day trading has a strongly negative expected value for most participants.** The widely-cited figure is that the large majority of active day traders lose money over time. Adding an LLM does not flip that — the model has no proprietary edge, and markets price in public information fast.
- **Position sizing kills compounding at this scale.** On a $150 position, a *good* day trade might net 1–2% = **$1.50–$3.00**. A bad day wipes out a week of those. "Reinvest profits to grow" only works on a *positive* edge; with a negative or zero edge, reinvesting just feeds a slow drawdown.
- **Costs can exceed gains.** Trading is commission-free, but **running the agent is not.** If you use the Claude or OpenAI API to analyze markets several times a day, token costs alone can run **$1–$10+/day** depending on context size and frequency. On a $150 stake, the LLM bill can plausibly be larger than your trading profit. (Using a flat-rate Claude/ChatGPT subscription instead of metered API avoids this — see costs below.)
- **Taxes & wash sales:** frequent trading generates short-term gains (taxed as ordinary income) and messy wash-sale bookkeeping. Minor at $150/week, but real if it scales.

**Bottom line:** Feasible to *build*. Unlikely to be *profitable*. The realistic value here is education, automation skill-building, and a genuinely useful research/screening assistant — with a hard-capped budget you treat as the cost of learning, not an investment expected to grow.

---

## 5. Cost breakdown

| Item | Realistic cost | Notes |
|---|---|---|
| Brokerage commissions (RH / Alpaca) | **$0** | Commission-free US equities |
| Robinhood MCP connection | **$0** | No fee to connect; standard regulatory/fee schedule applies |
| Alpaca paper trading + data | **$0** | Free real-time data + 6+ yrs history in paper |
| **LLM — metered API (Claude/OpenAI/Codex)** | **~$30–$300+/mo** | Scales with run frequency & context size. The main hidden cost. Easy to overspend. |
| **LLM — flat subscription** (Claude Pro/Max or ChatGPT Plus/Pro) | **$20–$200/mo** | Predictable. Better fit for small-budget continuous use than metered API. |
| Premium market data (optional) | $0–$99/mo | yfinance/Alpaca free tier is enough to start. Polygon/paid feeds only if needed. |
| Hosting (for scheduled/always-on runs) | $0–$10/mo | Runs on your machine for free; a $5 VPS only if you want 24/5 unattended. |
| **Trading capital (your "tuition")** | **$100–$200/wk** | Treat as capped, expendable learning budget — not seed capital expected to compound. |

**Cheapest sane starting config:** Alpaca paper ($0) + a flat-rate LLM subscription you already pay for + local scheduled runs ($0) = **effectively $0 to prove the concept** before any real money moves.

---

## 6. Smart architecture & methods

Design principle: **separate the brain from the hands, and keep a human at the trigger** until the data earns trust.

```
  DATA / SENSORS            DECISION LAYER              EXECUTION
 ─────────────────        ──────────────────         ────────────────
 tradingview-mcp   ─┐
 Alpaca data        ├──►  Agent (Claude/Codex)  ──►  Paper (Alpaca)   [Phase 1-2]
 yfinance/news      │     - strategy rules.md         ───────────────
 your watchlist    ─┘     - risk limits             Live (Robinhood
                          - proposes trades          agentic acct,    [Phase 3, optional]
                          - logs reasoning           human-approved)
```

**Patterns worth copying from the Reddit desk** (good engineering, regardless of whether its strategy works):
- **Charter file** = immutable constitution the agent can't override (universe, hard risk caps, circuit breakers). Changes are logged with date + reason.
- **Decision Journal** = one entry per trade *and per rejection*, written at decision time. Rejections matter as much as fills.
- **Cross-model red-team** = a *different* model family told to be a hostile prosecutor and default to "no." The value is the hostility, not the second opinion.
- **Coaching loop** = next-morning self-review that grades yesterday's calls against actual prices and promotes durable lessons into the playbook.
- **Dead-man switch + heartbeats** (healthchecks.io, phone pings) so silent failures are loud. This is the unglamorous 80% of trustworthy automation.
- **Two-gate permissions** = broker allows agent trading AND a one-time human `settings.json` allow-list edit; the agent can never grant itself order permission.

**Concrete methods:**
1. **Write the strategy as a versioned file** (`strategy.md` / rules in code), not as a vague prompt. Explicit entry/exit rules, max position size, max trades/day, daily stop-loss, allowed tickers. The agent *executes a documented plan*; it does not freelance.
2. **Hard risk rails in code, not in the prompt.** Max $ per position, daily loss limit that halts trading, a kill switch. Never trust the model to self-limit — enforce it in the wrapper that calls the broker.
3. **Read + propose, human approves** (at least for Phase 3 live). Robinhood supports per-trade approval previews — use them. "Read-only and suggests" is the safe default; full auto-execute is the thing you graduate to, if ever.
4. **Paper trade first, for real — 60–90 days minimum.** Log every proposed trade, the agent's reasoning, and the hypothetical fill. Compare against just holding an index. If it doesn't beat buy-and-hold *on paper*, it won't beat it with real money.
5. **Backtest before live.** Replay the strategy over historical data. An LLM "looks reasonable" narrative is not a backtest.
6. **Scheduled runs, not always-on chaos.** A pre-market scan + a few intraday check-ins is plenty. Continuous high-frequency LLM calls burn money for no edge.
7. **Keep an immutable log.** Every decision, input snapshot, and outcome to a file/db so you can audit what the agent did and why. This is also how you actually learn whether it works.
8. **Codex vs. Claude roles:** use either/both as the agent runtime — both connect to Robinhood's MCP via the documented one-line setup. A sensible split: **Codex for building/maintaining the code and backtester**, **Claude (or Codex) as the live decision runtime**. No need for both at run time; pick one to keep cost and complexity down.

---

## 7. Recommended phased plan

**Phase 0 — Decide the real goal (now).** Is this "learn to build trading automation" (great goal) or "generate income from $150/week" (very unlikely)? The build is the same; your expectations and budget discipline differ enormously. Recommend framing it as the former.

**Phase 1 — Build the read-only research agent (week 1–2).** Wire up `tradingview-mcp` + Alpaca/yfinance data to Claude or Codex. Have it screen, analyze, and *propose* trades to you in a daily report. No execution. Near-zero cost. Genuinely useful even if you never automate trading.

**Phase 2 — Paper trade the strategy (weeks 3–14).** Encode explicit rules + risk limits. Run against Alpaca paper. Log everything. Benchmark vs. buy-and-hold. This is the go/no-go gate.

**Phase 3 — Optional small live pilot (only if Phase 2 clears the bar).** Fund a Robinhood **Agentic** account with your capped weekly budget. Keep per-trade approval ON initially. Compare live results to the paper expectation. Be ready to pull the plug.

**Never:** give the agent un-capped, un-approved, always-on authority over money you can't afford to lose. The Robinhood disclosures say it plainly — *you* own every trade the agent makes, AI agents make errors, and losses can be total.

---

## 8. Open questions for you

1. **Goal:** automation/learning project, or genuinely trying to grow $150/week into income? (Changes how aggressively we build and budget.)
2. **LLM budget:** do you already have a flat-rate Claude/ChatGPT subscription we should run this on, or are you okay with metered API costs?
3. **Risk comfort:** is the weekly $100–200 truly expendable "tuition," or money you'd be upset to lose?
4. **Next build step:** want me to scaffold the **Phase 1 read-only research agent** (data plumbing + daily screening report, zero execution) in this repo?

---

## Appendix A — Robinhood Agentic setup & access scope

**Connection (paste one URL; ~5 min):**
- **Claude Code:** `claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading` → run `/mcp` → select `robinhood-trading` → authenticate.
- **Codex CLI:** `codex mcp add robinhood-trading --url https://agent.robinhood.com/mcp/trading` → `/mcp` → select it.
- **Claude/ChatGPT/Cursor/Grok desktop:** add custom connector with MCP link `https://agent.robinhood.com/mcp/trading`.

**Account rules:**
- Must have a primary individual investing account in good standing first.
- The Agentic account is a separate self-directed individual account (you can have up to 10 total, including it). Fund it with only the capped balance you'll let the agent touch.
- Onboarding/authentication must be done on a **desktop** browser (copy the URL over from mobile if needed).
- **Equities/ETFs only** in the current beta (options, crypto, futures, event/prediction markets "coming soon").

**Access scope (important):**
- **Read access to ALL your Robinhood accounts** — account numbers, every position and balance, and full transaction/order history.
- **Trade (write) access is limited to the Agentic account only.** The agent cannot place orders in your other accounts.
- Per Robinhood: *you* own every trade the agent makes; data shared with your chosen AI provider leaves Robinhood's environment and is governed by that provider's terms.

**Two gates to go live (matches the Reddit desk):**
1. **Broker gate** — the Agentic account is flagged to allow agent trading.
2. **Harness gate** — Claude Code/Codex won't place a real-money order until you make a deliberate, one-time allow-list edit (e.g. `mcp__robinhood-trading__place_equity_order` in `settings.json`). The agent cannot grant itself this. Keep per-trade approval ON until paper results justify removing it.

---

### Sources
- The Reddit post being evaluated (r/ClaudeAI, "Connected a Robinhood Account to Claude Code and Codex… Update 1") — https://www.reddit.com/r/ClaudeAI/comments/1ucy85c/connected_a_robinhood_account_to_claude_code_and/
- Robinhood Agentic Trading overview & setup — https://robinhood.com/us/en/support/articles/agentic-trading-overview/
- Robinhood Agentic Trading product page — https://robinhood.com/us/en/agentic-trading/
- TechCrunch, "Robinhood now lets your AI agents trade stocks" (May 27, 2026) — https://techcrunch.com/2026/05/27/robinhood-now-lets-your-ai-agents-trade-stocks/
- `tradingview-mcp` repo — https://github.com/atilaahmettaner/tradingview-mcp
- Trayd MCP (Robinhood-via-Claude alternative) — https://github.com/trayders/trayd-mcp
- Ryan Doser, "How to Build an AI Trading Agent on Robinhood" — https://ryandoser.com/ai-trading-agent-robinhood/
- Fidelity API status — https://usefidelity.com/fidelity-api-automated-trading/
- SnapTrade Fidelity integration (read-only) — https://snaptrade.com/brokerage-integrations/fidelity-api
- Alpaca Trading API & free paper trading — https://docs.alpaca.markets/us/docs/trading-api
- Pattern Day Trader rule elimination (Schwab) — https://www.schwab.com/learn/story/sec-approves-scrapping-25000-day-trader-minimum
