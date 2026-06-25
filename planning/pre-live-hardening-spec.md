# Build Spec — pre-live hardening + governance polish

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/infra.md`, `.agents/data-format.md`, `strategy/charter.md`, `strategy/playbook.md` first. **M1 and M2 are pre-live BLOCKERS — fix before any real order. M3/M4 are polish.** Each milestone = its own branch + PR._

## Context (verified in code)
- `gate.ts` is sound: live status is re-derived from files on every order, fails closed, halt persisted — no fix needed.
- **Bug A — hard rails fed placeholders at approval.** `evaluateApprovalBlocks` (`live-order.ts`) builds its `RiskContext` with `ordersToday: 0`, `spyIntradayChangePct: 0`, `vix: 15`. So on the per-trade (live) approval path the **daily-order-cap** and the **SPY/VIX emergency-stop** rails never fire, despite the charter saying they're enforced before any order.
- **Bug B — no order idempotency.** No client-order-id / dedupe in `submitTradeApproval` → `placeLiveOrder`; a double-tap or retry could place the same Robinhood order twice.

## M1 — `feature/approval-real-risk-context` (PRE-LIVE BLOCKER)
Build the approval-time `RiskContext` from **real inputs**, so every charter rail actually fires at per-trade approval:
- **`ordersToday`** — from a persisted **per-ET-day order counter**, incremented at **placement** (not proposal), counting every path that actually placed (paper batch + human approvals). The ≤6/day cap must fire on the live approval path and across multiple runs in a day.
- **`spyIntradayChangePct` + `vix`** — from a live market source (Alpaca snapshot/quote) at approval time, so the emergency-stop rail (SPY −2% / VIX>30) fires.
- Keep drawdown/high-water from the snapshot (already correct).
- **Acceptance:** unit + integration tests prove a 7th placement in an ET day is blocked by the daily-cap rail on the approval path; an order during SPY −2% or VIX>30 is blocked at approval; the counter persists across runs and resets per ET day.

## M2 — `feature/order-idempotency` (PRE-LIVE BLOCKER)
- Generate a stable **client order id / idempotency key** per approved order; pass it to the broker where supported and record placed ids. A repeat submit of the same approval (double-tap, retry) must **place at most once** and return the existing result.
- Guard at `submitTradeApproval` (before routing) so the dedupe covers paper, mock, and live paths.
- **Acceptance:** submitting the same approval twice places exactly once (unit-tested for live + dry-run paths); concurrent double-submit is safe.

## M3 — `feature/target-and-sector-governance` (polish — fixes the GE-proposal weaknesses)
- **Required `target_type`** on proposals: `prior_high | measured_move | atr_multiple | fundamental | analyst_price`. An `analyst_price` target is flagged weak by the red-team / checklist. Update the proposal schema, `.agents/data-format.md`, and the playbook checklist (target must be technically/fundamentally anchored, not a sell-side price).
- **Sector / concentration rail:** a configurable **max-sector-weight** enforced in the risk engine so a 5-position book can't be 3 correlated names. Surface it in guardrail-headroom.
- **Winner-exit discipline:** require a `takeProfit` (or a trailing-stop rule) at entry; add the symmetric exit rule to the playbook checklist (it currently governs entries + loss-trims but not winners).
- **Stop-priority rule:** codify the 8%-vs-ATR resolution in the charter + risk engine (e.g. the tighter of fixed-% and ATR-based wins) so sizing math is deterministic.
- **Acceptance:** `target_type` is required and surfaced; the sector rail blocks an over-concentrated book (tested); playbook + charter updated with dates in the change log; stop-priority is deterministic and tested.

## M4 — `feature/governance-scoring` (optional — the measurement layer)
Instrument the system to generate evidence about whether the governance adds value:
- Track outcomes of **red-team-rejected vs approved** ideas (where observable on paper) and **checklist-item presence vs P&L**, surfaced on the Evaluation page as a small "governance scorecard."
- **Acceptance:** the scorecard shows red-team approve/reject hit-rates and per-rule rejection counts over the window; it's clearly advisory and sample-size-caveated.

## Out of scope
- Real-money execution itself (gates stay deliberate/human); options/crypto/margin.
