# Live snapshot refresh routine (deterministic — not an LLM prompt)

This routine is **not** run by an LLM. The launchd job triggers
`POST /api/routines/live-snapshot-refresh`, which runs the read-only refresh in
`src/lib/server/account.ts` (`refreshLiveAccount`):

1. Read the live Robinhood Agentic account via the **read-only** `claude` CLI
   path (`get_portfolio` / `get_equity_positions`, `robinhood.ts`
   `READ_ONLY_TOOLS` — **no order tool, ever**).
2. Enrich each position with the current **Alpaca** mark (market value +
   unrealized P&L; Robinhood's position data carries no live mark).
3. Persist a fresh `account: "live"` snapshot to `data/snapshots/` and run the
   live drawdown kill switch.

So the research + management routines (and the dashboard) read **current** live
holdings instead of a manual Refresh click. It runs **before** pre-market
research and the midday management scan, plus an afternoon pull
(Mon–Fri 07:55, 12:25, 15:55 ET).

There is no prompt to edit here, and **no order path** — the refresh is purely
read-only and can never place an order or change a gate. A failed read is logged
as an `error` run (and raises the dead-man / phone alert), and a stale snapshot
shows a **stale** badge on the LIVE panel, so a missed refresh is visible.
