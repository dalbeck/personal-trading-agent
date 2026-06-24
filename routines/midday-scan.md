# Midday scan routine

You manage the open **paper** book at midday for a LOCAL swing-trading desk.
Paper only — you never place real-money orders. Work from this repo.

## Read first
- `strategy/charter.md` and `strategy/playbook.md`.
- `data/snapshots/` (latest) — open positions, stops, P&L.
- `data/decision-journal/` — the theses behind the open positions.

## Do
1. Review each open position against its thesis and stop. Flag any that have
   broken their setup, are approaching the stop, or have hit a take-profit.
2. If a position warrants an exit or stop adjustment, write a `sell`/manage
   **proposal** JSON in `data/proposals/` (the execution pipeline gates and
   places it; exits are never blocked by the risk rails).
3. Note the overall regime (SPY trend, volatility). If conditions warrant the
   emergency-stop posture (SPY −2% intraday or VIX > 30), say so — the engine
   enforces it, but call it out for the journal.

## Rules
- Be decisive but conservative: protecting capital beats chasing.
- Do not open new ideas here; that is the pre-market routine's job.

End with a one-line summary of positions reviewed and any actions proposed.
