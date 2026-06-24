# Build Spec — full-width layout + expanded Overview

_Executable spec for a local Claude Code session. Read `AGENTS.md` + `.agents/design-system.md` + `.agents/nextjs.md` first. Two feature branches + PRs. Reuse existing data readers and components — do not duplicate logic or add real-money paths._

## M1 — `feature/full-width-layout` (global, all pages)
- Change the app shell from the current centered narrow container to a **fluid full-width** layout with comfortable gutters (e.g. horizontal padding ~24–32px). Applies to **every** page, not just Overview.
- Optionally cap at a high max width on ultra-wide monitors (e.g. ~1800px) so line lengths stay sane; otherwise fluid. No small centered `max-w-*` wrapper.
- All existing card grids reflow responsively (CSS grid `auto-fit`/`minmax`) so they use the new width instead of staying narrow.
- **Acceptance:** every page uses the available width; cards/tables reflow cleanly from laptop (~1280px) to ultrawide; no horizontal scroll; both light and dark intact.

## M2 — `feature/overview-modules` (expand the Overview page)
Keep the existing KPI row + equity curve; add a `vs SPY (excess)` KPI. Add these modules, each reading from `data/` via the existing server readers:

1. **Attention strip ("Needs you")** — top of page. Live counts of: proposals **awaiting human review**, orders **blocked today** (rules/red-team), and **errored/stalled routine runs / alerts**. Each links to the relevant view. When nothing is pending, show a calm "all clear" state, not an alarm.
2. **Awaiting review** — the top pending proposals (ticker, side, qty, stop, and the **red-team verdict**) with **approve/reject** using the *existing* approval flow (`AlertDialog` confirm; paper/no-op semantics as already built). Links to the full Proposals view.
3. **Guardrail headroom** — current **drawdown vs the −10% halt**, **orders today vs the daily cap**, **open positions vs the max**, pulled from the risk-engine config + current state. Bars/figures showing headroom against each rail.
4. **Latest activity** — a compact feed of recent fills, journal entries, and rejections from `data/` (newest first, with timestamps + the routine that produced each).
5. **Routines & health** — the five routines with last-run status + next-run time, plus dead-man-switch / heartbeat health and lock status.
6. **Evaluation gate snapshot** — days into the window, current **excess return vs SPY**, process-integrity status, and the **advisory verdict pill** (GO-candidate / ITERATE / NO-GO / incomplete). Links to `/evaluation`.

**Empty states (important):** when a module has no data yet, show a calm prompt with a next step (e.g. "No proposals yet — run a routine from Operations"), never a blank panel or a wall of `$0.00`. This directly fixes the current barren-on-first-load look.

- **Acceptance:** Overview renders all modules from real `data/` values; the attention strip reflects actual pending counts and hides/changes when empty; approve/reject works through the existing flow (no new execution path); empty states are graceful; full-width; light + dark + a11y (focus, `aria-label` on icon-only approve/reject buttons) all correct.

## Out of scope
- Any new real-money path or broker call (Phase 3 M5 stays gated).
- New data sources — reuse existing readers; this is presentation + reuse.
