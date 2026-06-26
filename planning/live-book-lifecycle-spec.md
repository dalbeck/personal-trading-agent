# Build Spec — live (Robinhood) book lifecycle parity + production readiness

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/infra.md`, `strategy/charter.md`, `strategy/playbook.md`, and the routines in `routines/` first. Priority order as listed. Each milestone = its own branch + PR._

## Context (verified in code)
- Pre-market **already** produces live BUY ideas (`account:"live"`, `advisory:false`, approvable, sized against the live snapshot, gated). The buy side for live is built.
- **Gap:** `midday-scan` manages the **paper** book only. No routine reviews the **live** holdings to propose exits/trims. That's the priority.
- All live execution stays gated: two gates + per-trade approval; approved live orders route to the dry-run sink until the gates are opened (a deliberate human action). None of that changes here.

## M1 — `feature/live-position-management` (priority)
A routine that tends the **live** book the way midday-scan tends paper:
- Read the latest **live** snapshot (real Robinhood holdings + stops + P&L) and the theses behind them from the journal.
- Review each live holding against its thesis, stop, and take-profit; flag broken setups, positions approaching the stop, or those that hit a take-profit/trailing level (use the M3 winner-exit discipline).
- Write **`account:"live"` sell / manage proposals** (exit, trim, or stop adjustment) for the human to approve → place. Exits are **never blocked by the risk rails** (reducing risk is always allowed), consistent with the paper midday-scan.
- Respect the live caps; an exit/trim never breaches them. Keep the existing approvable-vs-advisory distinction and the gate as the real-money boundary.
- Either extend `midday-scan` to cover both books or add a parallel `live-position-management` routine + plist.
- **Acceptance:** given live holdings, the routine emits live sell/exit/trim proposals with reasoning; exits aren't rail-blocked; execution stays gated (dry-run until gates open); tested.

## M2 — `feature/live-snapshot-refresh`
Production desks need fresh live data, not a manual Refresh click:
- A scheduled **read-only** refresh that calls the Robinhood read path (`get_portfolio`) and writes a fresh live snapshot before the research + management routines run (and at a sensible intraday cadence). Read-only — no order tools, no gate change.
- Surface snapshot freshness (already partly built); alert if a refresh is stale/failed.
- **Acceptance:** the live snapshot auto-refreshes on cadence; freshness is visible; no order path is touched; a failed refresh is surfaced.

## M3 — `feature/live-lifecycle-coverage`
Make the live book first-class across the whole lifecycle, not just entry:
- Ensure the **end-of-day summary** and **weekly review** cover the live book (P&L, exits taken, behavior), clearly labeled, alongside paper.
- A live performance view (vs cost basis and vs SPY) and inclusion in the governance scorecard where observable.
- **Acceptance:** the live book appears in EOD/weekly/eval surfaces, distinctly labeled; no paper/live data bleed.

## M4 — `feature/live-production-readiness`
Reliability for an unattended live desk:
- Process supervision (pm2/launchd) so the dashboard server auto-restarts; confirm the scheduled routines + the live refresh survive a crash/reboot.
- Dead-man switch + phone heartbeats wired for the live routines (not just paper); the live drawdown kill switch verified end to end.
- The daily encrypted R2 backup on a real schedule.
- **Acceptance:** a killed server auto-restarts; a stalled live run raises an external alert; a backup runs unattended; documented in `scripts/README.md`.

## Hard guardrails (non-negotiable)
- Every live order — buy or sell — still requires per-trade human approval and both gates open; the agent opens neither gate, funds nothing, and places nothing on its own. Exit/manage proposals are proposals, not auto-executed.
- Not investment advice; the human approves and places every real trade.

## Out of scope
- Auto-execution without per-trade approval; options/crypto/margin.
