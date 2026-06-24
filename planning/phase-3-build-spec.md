# Phase 3 Build Spec — Live Robinhood + two-gate approval (SMALL real money)

_Executable spec for a local Claude Code session. Read `AGENTS.md` + `.agents/*.md` first. **Gate: do not start Phase 3 until Phase 2's paper desk has repeatably beaten SPY with controlled drawdowns over the evaluation window.** This phase involves real money — every safeguard here is mandatory._

## Hard boundary (read first)
- Real-money orders are placed **only** through the two-gate flow with **explicit human approval** per trade. No agent — and no assistant — autonomously executes trades or moves money. The human turns the keys and approves each order.
- Start with the **smallest viable** real allocation (the ~$100/week cap). This is a controlled live pilot, not a scale-up.

## Outcome
The proven paper strategy runs against a funded **Robinhood Agentic** account, with read-everything/trade-one scope, hard funding caps, per-trade human approval, a live drawdown kill switch, and an incident runbook.

## Milestones (each = feature branch + PR)

### M1 — `feature/robinhood-readonly`
- Connect the Robinhood Trading MCP (`https://agent.robinhood.com/mcp/trading`) in **read-only** use first: wire the dashboard **LIVE** panel to real Robinhood portfolio snapshots via `get_portfolio`. **No order tools enabled yet.**
- Snapshots written to `data/snapshots/` (JSON) so the LIVE panel and the agent share one source of truth.
- **Acceptance:** LIVE panel shows the real Robinhood Agentic account; no order-placement capability exists in the build yet.

### M2 — `feature/two-gate-permissions`
- Implement + document the **two gates**: (1) broker gate — the Agentic account allows agent trading; (2) harness gate — a one-time human `settings.json` allow-list edit enabling `place_equity_order` / `cancel_equity_order`. The agent **cannot** grant itself these; verify the harness blocks self-edits.
- Dashboard shows an unambiguous **LIVE TRADING: ON/OFF** status reflecting whether the harness gate is open, plus a one-click "disconnect" affordance.
- **Acceptance:** with the gate closed, order attempts are blocked end-to-end; the status indicator is accurate; the agent cannot self-enable.

### M3 — `feature/per-trade-approval`
- Every live order requires **explicit human approval in the dashboard** before the engine calls the broker tool: an `AlertDialog` with a full order preview (ticker, side, qty, order type, limit price, est. cost, the thesis, the red-team verdict). Default ON; cannot be globally disabled in this phase.
- Approvals/denials are journaled.
- **Acceptance:** no live order reaches the broker without a recorded human approval; denial cleanly cancels.

### M4 — `feature/live-caps-and-breakers`
- Enforce, in code, against the live account: the weekly **deposit/funding cap**, a hard account-level max exposure, and a **live drawdown kill switch** that halts new risk and alerts at a configured loss threshold.
- Reuse the Phase 2 risk engine; add live-only guards (e.g., reject if the order would exceed the funded cap).
- **Acceptance:** orders breaching any live cap are blocked and journaled; tripping the drawdown threshold halts trading and fires an alert.

### M5 — `feature/live-pilot-monitoring`
- Run the smallest viable live allocation. Extend the dead-man switch + phone heartbeats to live runs. Track **live fills and slippage vs. the paper expectation** for the same signals.
- **Acceptance:** a live pilot session completes with per-trade approvals, full journaling, and a live-vs-paper comparison report.

### M6 — `feature/kill-switch-and-runbook`
- A **one-command kill switch**: revoke the harness order permission, disconnect the MCP, and halt routines. Plus a written **incident runbook** ("agent misbehaving / unexpected position / data looks wrong") with exact steps.
- **Acceptance:** the kill switch demonstrably disables live trading in one action; the runbook is reviewed and stored in `planning/`.

## Definition of done
- Live pilot runs under per-trade approval with every safeguard active; live results are compared honestly to paper; the kill switch + runbook are verified.
- A decision point: continue the capped pilot, adjust, or stop — based on real (not hypothetical) results.

## Out of scope (do NOT build without explicit new approval)
- Removing per-trade approval / fully unattended live trading.
- Options, crypto, futures, prediction markets, margin.
- Any increase beyond the agreed funding cap.
