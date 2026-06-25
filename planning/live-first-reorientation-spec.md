# Build Spec — Live-first reorientation

_The desk's center of gravity moves from the Alpaca paper desk to the **live Robinhood account**. Paper stops being the focus and becomes invisible safety plumbing. Read `AGENTS.md`, `.agents/*`, and `planning/live-execution-spec.md` first._

## Intent

The desk's **primary purpose** is to research, vet (risk rails + Codex red-team), and **propose trades for the human's live Robinhood account**, for per-trade human approval. The dashboard, the discovery routine, the docs, and the charter all lead with **live**. The Alpaca **paper** desk is demoted to a **secondary safety net** — the gate-closed dry-run sink and a fallback — and is no longer a focus of the UI or the routines.

This pivot also **unblocks proposal generation today**: the live account has a real snapshot and Alpaca *data* works, so a live-first discovery run can produce real, priced proposals **without** the missing Alpaca *paper-trading* keys.

## Non-negotiable safety (unchanged — this is what makes live-first safe)

- The app **never auto-trades**; **per-trade human approval** is required for every live order.
- The **two gates** + `assertLiveOrderAllowed` (fails closed); the agent can open neither and can't self-grant.
- **Gate closed → the dry-run sink (paper/mock), never Robinhood.** This is *why paper stays* — an approved live order has a safe place to go until the gates open. **Do not remove the paper sink.**
- Risk rails + red-team + the live caps ($100/wk funding, $500 exposure, −10% kill) gate every order. Hands-off automation stays gated on the Phase 2 scorecard. Not investment advice.

## R1 — `feature/live-first-defaults` — focus, defaults, philosophy

- **Default view = Live.** `DEFAULT_VIEW_MODE` → `live` (`src/lib/mode.ts`); the dashboard opens on the live book. Paper is one toggle away, not the default.
- **Charter philosophy reframed** (`strategy/charter.md` + change log): the desk's mandate is the **live account, human-approved**; paper is the proving ground / dry-run sink, secondary. No risk-rail or cap *numbers* change (`charter.config.ts` untouched; the tripwire stays green).
- **Docs reframed live-first** (`.agents/infra.md`, `.agents/nextjs.md`, `.agents/data-format.md`): live is primary; paper is the safety sink.
- **UI copy/emphasis**: Overview / Positions / Proposals / News lead with the live account; the sidebar footer ("Paper-only · read-only") and paper-centric empty states are reframed. The **Evaluation** (paper scorecard) is labelled clearly as the *secondary* paper proving-ground gate, not the desk's headline.
- **Acceptance:** the app opens in Live; the live account is the headline everywhere; paper is present but visibly secondary; safety rails + the dry-run sink unchanged; light/dark/a11y.

## R2 — `feature/live-first-discovery` — fill the live queue

- The pre-market routine **leads with the live account**: scan the live holdings + watchlist + sources, size candidates against the **live** equity (fractional OK), price via **Alpaca only** (the local `/api/symbol/<t>/bars` endpoint), and write **live approvable proposals** for review. Paper proposals only if a paper account actually exists (optional, secondary) — never block the run on a missing paper book.
- Make the market-data path reliable: the routine uses the Alpaca curl endpoint and does **not** reach for MCP market-data tools (charter = Alpaca-only data). Verify a real run writes live proposals to the queue.
- **Acceptance:** a real discovery run produces **live approvable proposals** sized/priced against the Robinhood account, with no Alpaca paper keys required; each is review-only (approve → gate-closed dry-run until the gates open); caps/rails/red-team respected.

## Out of scope

- **Removing paper entirely** (it is the dry-run safety sink — keep it).
- Opening the gates / auto-trading (human-only; unchanged).
- Options / crypto / margin; raising the caps.
