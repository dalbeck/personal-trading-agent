# Build Spec — Human-approved live execution (Robinhood)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/infra.md` (two-gate design), `.agents/nextjs.md`, `.agents/data-format.md` first. Two feature branches + PRs, plus human-only gate steps._

## Intent

Graduate the live side from **read-only + advisory** to **human-approved execution**: the desk reads the real Robinhood Agentic account, proposes actions on existing holdings **and** new ideas (full research + risk rails + Codex red-team), and **on the human's per-trade approval the app places the order in the real Robinhood account**. 

This is **human-in-the-loop, never hands-off.** Every order waits on the human's button — the app never auto-trades. Per-trade approval stays ON. Hands-off automation remains a separate, future capability still gated on a passing `planning/phase-2-evaluation-scorecard.md`.

## What already exists (do not rebuild)

- Read-only Robinhood account + order-history sync (`robinhood.ts`, `live-trades.ts`).
- The full **propose → red-team → human-approve → route → journal** pipeline (`live-order.ts`): `routeApprovedOrder` already sends gate-closed orders to the **dry-run sink** (Alpaca paper / mock) and gate-open orders to the **live Robinhood path**. Risk-rails re-check, red-team block, and the live caps ($100/wk funding, $500 exposure, −10% kill) are wired.
- The two-gate model (`gate.ts`): `assertLiveOrderAllowed` fails closed; the agent can open neither gate.

The only deliberate blocks between today and the goal: (a) live proposals are forced **advisory** (no approve button), and (b) the real `place_equity_order` call is a safety stub.

## M5a — `feature/live-approvable-proposals` — approve → route (gate-closed, dry-run-safe)

- **Redefine advisory by intent, not by account.** `isAdvisoryProposal` becomes `advisory === true` only (drop the implicit `account === "live"`). A **live proposal can now be either**: `advisory: true` = manual guidance (review/dismiss, never app-placed), or `advisory: false` = **approvable** (the app places it on approval). Default for live discovery stays advisory; approvable is opt-in.
- **Approvable live proposals flow the existing approval path** (`POST /api/live/approve` → `submitTradeApproval` → `routeApprovedOrder`). With the gate **closed** (the shipped state), approval routes to the **dry-run sink** — so the entire human-approved flow is testable today with **zero real money**, never touching Robinhood.
- **UI:** the Proposals approve dialog already differentiates gate-open ("places a REAL order", danger) vs gate-closed ("dry-run sink"). Reuse it for approvable live proposals; label them clearly (`live · approve to place`), distinct from advisory (`live · advisory · execute manually`).
- **Charter amendment** (`charter.md` + `charter.config.ts` + change log, in lockstep): permit **human-approved** live execution once both gates are open; **hands-off automation stays gated on the Phase 2 scorecard**. Live caps unchanged.
- **Tests:** a gate-closed approval of a live proposal routes to the dry-run sink and **never** to Robinhood; an advisory live proposal is still refused by the approval endpoint; the gate still fails closed.
- **Acceptance:** you can approve a live proposal and watch it run the full pipeline into the paper sink (gate closed); advisory proposals still can't be approved; no real order is reachable.

## M5b — `feature/robinhood-order-placement` — the real `place_equity_order` (still gated)

- Implement `defaultRobinhoodPlaceOrder` (`live-order.ts`) via the Robinhood MCP `place_equity_order`, through the same host-`claude`-CLI transport the read-only client uses (argv, shell-free, account-scoped). **Injectable + unit-tested** for command/mapping — no real order placed in tests.
- It stays **unreachable while the gate is closed** (`assertLiveOrderAllowed` throws first). Implementing it does **not** open anything.
- Document the **live wire-shape verification** as a supervised, human-present step at gate-open time (the real MCP response shape is confirmed against one tiny live order).
- Update `planning/two-gate-live-trading.md` and the kill-switch runbook for the human-approved-execution era.
- **Acceptance:** the order-placement call is implemented + unit-tested; it remains provably unreachable until both gates are open; turning it on is still exclusively the human's two-gate action.

## Human-only steps (not code — the agent is barred)

1. Set the Robinhood Agentic account to allow agent trading; set `ROBINHOOD_BROKER_TRADING_ENABLED=1` (broker gate).
2. Add the order tools to `.claude/settings.json` allow-list (harness gate). The agent cannot edit `.claude/**`.
3. Confirm the live wire shape with one small, supervised, human-approved test order.

Until all three are done, every approval routes to the dry-run sink.

## Hard guardrails (unchanged)

- The app **never auto-trades** — per-trade human approval is required for every live order.
- The agent can open **neither** gate and cannot self-grant order permission; `assertLiveOrderAllowed` fails closed.
- Risk rails + red-team gate every order; live caps ($100/wk, $500 exposure, −10% kill) and the kill switch / halt latch still apply.
- Hands-off automation remains gated on a passing `planning/phase-2-evaluation-scorecard.md`. Not investment advice.

## Out of scope

- Hands-off automation (no human in the loop). Options / crypto / margin. Raising the live caps.
