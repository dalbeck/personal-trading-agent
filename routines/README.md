# Routines

The five scheduled jobs that run the paper desk. **Paper only — no real money.**

Each routine is triggered by a launchd job (see `scripts/`) that POSTs to the
local engine endpoint `POST /api/routines/<id>` on the always-on dashboard
server. The endpoint runs the routine under a single-instance **lockfile** and
writes a structured **run log** to `data/logs/`.

| Routine | Id | Cadence (ET) | Kind |
|---------|----|--------------|------|
| Pre-market research | `pre-market-research` | Mon–Fri 08:00 | `claude -p` (writes proposals) |
| Market-open execution | `market-open-execution` | Mon–Fri 09:35 | **deterministic** code pipeline |
| Midday scan | `midday-scan` | Mon–Fri 12:30 | `claude -p` (manage risk) |
| End-of-day summary | `end-of-day-summary` | Mon–Fri 16:15 | `claude -p` (snapshot + journal) |
| Weekly review | `weekly-review` | Sun 17:00 | `claude -p` (coaching) |

## Why execution is not an LLM prompt

`market-open-execution` does **not** ask an LLM to place trades. It runs the
**code-enforced pipeline** (`src/lib/server/execute.ts`): every pending proposal
passes the risk rails (`src/lib/risk`) **and** the cross-model red-team
(`src/lib/server/red-team.ts`) — in code — before Alpaca paper is ever called. A
block at either gate is journaled as a rejection. The LLM proposes; it never
executes.

The `.md` files here are the prompts for the four analytical routines. They are
read-only research/journaling sessions: they never place orders.
