# Build Spec — strategy coherence (analytical identity, volume, catalysts)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `strategy/charter.md`, `strategy/playbook.md`, `.agents/data-format.md`, and the routines first. From a finance-industry review of the charter/playbook. Each milestone = its own branch + PR. No real-money paths; these change proposal *quality*, not the gates._

## M1 — `feature/analytical-identity` (the big one)
Resolve the fundamental-vs-technical muddle by declaring a **hierarchy**, not throwing one out:
- State plainly in `charter.md` + `playbook.md`: **this is a technical trend-following desk.** Technical analysis drives entry, exit, and sizing. **Fundamentals (Perplexity) serve one defined role only — a catalyst check and a disqualifier** (avoid value traps; avoid imminent earnings binaries). Fundamentals are **never** the primary entry rationale and **never** the source of the price target.
- Reinforce the existing `target_type` rule: `analyst_price` is an explicitly **weak / disqualifying** target — targets must be technical (prior high, measured move, ATR multiple).
- Update the **red-team** prompt to penalize a thesis whose primary rationale is fundamental/valuation, and to flag analyst-price targets.
- **Acceptance:** charter + playbook state the hierarchy (with a dated change-log entry); the red-team flags fundamental-primary theses and analyst-price targets; tested.

## M2 — `feature/relative-volume-check`
Add the volume confirmation the reviewer asked for:
- Compute **relative volume** = current/entry-day volume ÷ the 20–50 day average (from Alpaca). Add it to each proposal and surface it on the proposal card + symbol view.
- Add a pre-trade checklist item: breakouts require **above-average** volume (e.g. ≥1.3–1.5×); pullback entries should be on **declining** volume. Weigh it in the checklist + red-team (soft signal, not a hard rail).
- **Acceptance:** proposals carry a relative-volume figure; the checklist/red-team weigh it; the playbook checklist gains the volume item; tested.

## M3 — `feature/catalyst-requirement`
Promote catalyst from a risk-note to a positive requirement:
- Require a **named catalyst** on each proposal: a `catalyst` field + `catalyst_type` (earnings_momentum | product_news | sector_rotation | guidance | other | none). A proposal with `none` (trend alone, no catalyst) is flagged **weak** by the checklist and the red-team.
- Update the proposal schema, `.agents/data-format.md`, and the playbook checklist (the current "catalyst & timing" item becomes a requirement, not just "avoid binary events").
- **Acceptance:** the catalyst field is required and surfaced; catalyst-less momentum chases are flagged weak; tested.

## M4 — `feature/regime-context` (optional)
A light macro/sector-rotation read the routines note for context (leaning on the existing RS check + SPY/VIX + sector-ETF relative performance), so trades align with where money is rotating rather than against it. Surfaced as a context line in the pre-market output and on the dashboard — **advisory context only, not a hard rail.**
- **Acceptance:** a regime/sector context line appears in the pre-market summary + dashboard; clearly advisory.

## Note on frequency
These raise proposal quality and will further *lower* trade frequency (more filters). That's intended — plan for a longer paper window to gather a meaningful sample, and do not loosen the risk rails to manufacture trades.

## Out of scope
- The gates / execution model (unchanged); options/crypto/margin.
