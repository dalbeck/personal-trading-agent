# Incident Runbook — trading desk

_Phase 3 M6. What to do when something looks wrong. **When in doubt, hit the kill
switch first and investigate after** — halting is always safe; it only reduces
capability. This is not investment advice._

## 0. The kill switch (do this first if unsure)

One command disables all trading:

```sh
scripts/kill-switch.sh
```

It (1) latches the trading **HALT** (forces LIVE TRADING OFF and makes the
routine pipeline refuse to trade — enforced in code, not just by unloading
jobs), (2) **revokes the harness order permission** in `.claude/settings.json`
(order tools removed from `allow`, forced into `deny`), and (3) **unloads the
scheduled-routine launchd jobs** and stops the news scout.

**Verify it engaged:**
- Dashboard header reads **LIVE TRADING: OFF** with a **disconnected** chip.
- `data/control/live-halt.json` exists.
- `.claude/settings.json` has no order tool in `allow`; both are in `deny`.
- `launchctl list | grep com.tradingdesk` returns nothing.
- A manual `curl -X POST localhost:3000/api/routines/<id>` returns `503 halted`.

If the dashboard server is down, the file halt (`data/control/live-halt.json`)
is already in effect — the kill switch writes it directly.

## 1. Scenarios

### Agent misbehaving (bad proposals, looping, odd reasoning)
1. `scripts/kill-switch.sh`.
2. Read the latest `data/logs/*.json` run logs and `data/decision-journal/` to
   see what it did. Note the offending proposal/run ids.
3. Do **not** re-arm until you understand the cause. Fix the prompt/charter, add
   a rail or red-team note if a class of mistake slipped through.

### Unexpected position (something is held that shouldn't be)
1. `scripts/kill-switch.sh` — stop any further orders.
2. Confirm reality at the broker directly (Robinhood app / Alpaca dashboard),
   **not** only via this app.
3. If a live position must be closed, do it **yourself** in the broker UI. The
   agent never closes positions for you. Journal what happened.

### Data looks wrong (P&L, positions, or equity look implausible)
1. Treat numbers as suspect — `scripts/kill-switch.sh` so nothing trades on bad
   data.
2. Cross-check the broker UI. Check the most recent `data/snapshots/*.json`
   against it.
3. If a snapshot is corrupt, the readers fail loudly with the file path
   (`lib/server/data.ts`); fix or remove the bad file. Run `pnpm validate:data`.

### Can't reach the dashboard / server is down
- The kill switch still works: it writes `data/control/live-halt.json` directly
  and revokes the harness permission. Run it from a terminal in the repo.
- To stop a wedged server: `pkill -f "next start"` / `pkill -f next-server`.

### Drawdown kill switch fired on its own
- The live drawdown breaker (`−10%` from the live high-water mark, M4) latches
  the halt and alerts automatically. Treat it as a real stop: review what drew
  the account down before re-arming.

## 2. Re-arming (deliberate, never casual)

Only after the incident is understood and resolved, and the Phase 2 scorecard
still justifies live trading:

1. Clear the halt: `curl -X POST localhost:3000/api/live/disconnect -d '{"action":"reconnect"}'`
   (or delete `data/control/live-halt.json`).
2. Re-open the harness gate **only if** you intend to resume live: add the order
   tools back to `allow` in `.claude/settings.json` (and remove them from
   `deny`). Leave them revoked to stay paper/dry-run.
3. Reload routines if desired: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tradingdesk.*.plist`.
4. Confirm the dashboard shows the intended state before walking away.

## 3. Guarantees (why this is safe by design)

- The agent **cannot** open the gate or re-arm: it can't edit `.claude/**`
  (harness deny) and has no enable function — see
  `planning/two-gate-live-trading.md`.
- Every live order needs a recorded **human approval** (M3) and clears the
  **risk rails + live caps** (M4) before any broker call.
- Halting only ever reduces capability; it is always safe to run the kill switch.
