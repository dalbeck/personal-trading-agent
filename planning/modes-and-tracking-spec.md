# Build Spec — Paper/Live modes, holding auto-tracking, autonomous discovery

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/infra.md` (two-gate design), `.agents/nextjs.md`, `.agents/data-format.md` first. Three feature branches + PRs. **Live stays read-only + advisory; the order gate stays CLOSED; no automated real-money execution (gated on the Phase 2 scorecard).**_

## M1 — `feature/account-mode-toggle` — Paper / Live view modes
- A global **Paper | Live** toggle in the header (reconcile with the existing PAPER / LIVE pills) that switches the **data context** for all panels (Overview, Positions, Journal, Proposals, News, Latest Activity, Symbol tracking).
- It is a **view switch, not an engine switch.** Both run concurrently: the paper desk trades paper; the live side is read-only + advisory. The toggle only picks which book is displayed. A subtle indicator should show the other mode is also active.
- **Safety:** Live mode must never expose an execution control — live proposals stay advisory ("execute manually"), the order gate stays closed. Toggling to Live cannot enable trading.
- **Mode-specific panels:** Evaluation is the *paper* go/no-go scorecard — in Live mode show the live read-only/advisory view (or a clear "paper-only gate" note), not the paper scorecard. Label scope on each panel.
- Persist the selected mode.
- **Acceptance:** toggling swaps all panel data between paper and live; both engines keep running; Live mode exposes no execution path; selection persists; light + dark + a11y.

## M2 — `feature/tracked-universe` — auto-track holdings + watchlist
- Define a **tracked universe** = current holdings in the active mode (paper positions / live Agentic positions) **+** an optional manual watchlist. Persist the watchlist (editable in the UI).
- Feed the universe to the **news scout** (wire it to include **live holdings**, not just the paper book — the previously-flagged piece) and the **research routine**.
- Owning a symbol (e.g. NVDA) auto-surfaces it in **News, Positions, Latest Activity, and the symbol detail** view.
- **Clarify scope in the UI:** News / Positions / Activity / Symbol = ownership-driven (auto-track). **Coaching / Evaluation = desk-behavior-driven** (populate from the desk's decisions, not mere ownership). Optionally (confirm with user) extend Coaching to also review the user's **manual live trades**.
- **Acceptance:** an owned symbol appears across the ownership-driven surfaces per mode; the watchlist is editable and read by the scout/research; the scout watches live holdings; Coaching/Evaluation remain behavior-driven (documented).

## M3 — `feature/autonomous-discovery` — new-idea proposals from scanning
- The pre-market research routine scans available sources (Alpaca news + web search + the **capped, default-off** Perplexity provider) plus the tracked universe to generate **new buy/sell proposals** (not only on current holdings), each with thesis + risk rails + Codex red-team verdict.
- **Bounded:** respects the per-day research cap, the daily order cap, the risk-engine limits, and the red-team gate — it cannot emit unlimited ideas.
- **Per mode:** paper → proposals flow through the normal paper pipeline; live → **advisory** proposals (execute manually), order gate closed, no execution path.
- Runs **only when routines run** (scheduled via launchd, or manually from Operations). Nothing auto-runs without the user starting it.
- **Acceptance:** a research run produces new-idea proposals with full reasoning, respecting all caps/rails/red-team; live discovery proposals are advisory-only with provably no execution path (unit-tested); with the research provider off, it still functions on free sources.

## Hard guardrails (non-negotiable)
- Live = read-only + advisory; order gate stays closed; automated execution remains gated on a passing `planning/phase-2-evaluation-scorecard.md`.
- Auto-generated proposals are candidates for human review, never auto-acted; the human places every real trade. Not investment advice.

## Out of scope
- Opening the order gate / automated real-money execution (Phase 3 M5, gated). Options/crypto/margin.
