# Market-open execution routine (deterministic — not an LLM prompt)

This routine is **not** run by an LLM. The launchd job triggers
`POST /api/routines/market-open-execution`, which runs the code-enforced
pipeline in `src/lib/server/execute.ts`:

1. Read every pending proposal from `data/proposals/`.
2. For each, build the risk context from the latest paper snapshot and run:
   - **Risk rails** (`src/lib/risk`) — size, position count, daily-order cap,
     drawdown halt, emergency stop, stop-attached, order-type, universe.
   - **Red-team** (`src/lib/server/red-team.ts`) — a cross-model `codex`
     prosecutor that defaults to "no" (fails closed).
3. A block at either gate is journaled as a **rejection**. A pass places a
   **marketable-limit bracket order on Alpaca paper** and journals the trade.

There is no prompt to edit here. Tune behavior by editing the charter
(`strategy/charter.md` → `strategy/charter.config.ts`) and the pipeline. The LLM
proposes; it never executes.
