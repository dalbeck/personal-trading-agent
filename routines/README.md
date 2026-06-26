# Routines

The scheduled jobs that run the desk. The paper routines place **paper** orders
only; the live routines are **read-only** — they write review-only proposals a
human approves per trade and **never place an order themselves**. No routine ever
places a real-money order.

Each routine is triggered by a launchd job (see `scripts/`) that POSTs to the
local engine endpoint `POST /api/routines/<id>` on the always-on dashboard
server. The endpoint runs the routine under a single-instance **lockfile** and
writes a structured **run log** to `data/logs/`.

| Routine | Id | Cadence (ET) | Kind |
|---------|----|--------------|------|
| Live snapshot refresh | `live-snapshot-refresh` | Mon–Fri 07:55, 12:25, 15:55 | **deterministic** read-only live pull (`get_portfolio`) |
| Pre-market research | `pre-market-research` | Mon–Fri 08:00 | `claude -p` (writes proposals) |
| Market-open execution | `market-open-execution` | Mon–Fri 09:35 | **deterministic** code pipeline |
| Midday scan | `midday-scan` | Mon–Fri 12:30 | `claude -p` (manage paper risk) |
| Live position management | `live-position-management` | Mon–Fri 12:35 | `claude -p` (review LIVE book → exit/trim proposals) |
| End-of-day summary | `end-of-day-summary` | Mon–Fri 16:15 | `claude -p` (snapshot + journal) |
| Weekly review | `weekly-review` | Sun 17:00 | `claude -p` (coaching) |

## Why execution is not an LLM prompt

`market-open-execution` does **not** ask an LLM to place trades. It runs the
**code-enforced pipeline** (`src/lib/server/execute.ts`): every pending **paper**
proposal passes the risk rails (`src/lib/risk`) **and** the cross-model red-team
(`src/lib/server/red-team.ts`) — in code — before Alpaca paper is ever called. A
block at either gate is journaled as a rejection. The LLM proposes; it never
executes. The batch is **paper-only**: `account: "live"` proposals (approvable or
advisory) are skipped here — every live order is human-approved per trade through
the approval path, so the autonomous batch never places a live-intent order.

`live-snapshot-refresh` is also **deterministic** (not an LLM prompt): it runs
the read-only `refreshLiveAccount` path (`get_portfolio` / `get_equity_positions`)
to persist a fresh `account: "live"` snapshot before the research + management
routines run. **No order tool, no gate change** — it can never place an order.

The other `.md` files here are the prompts for the five analytical routines. They
are read-only research/journaling sessions: they never place orders.
`live-position-management` reviews the **live** book and writes review-only
exit/trim proposals a human approves per trade.
