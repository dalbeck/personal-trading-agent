# Build Spec — dual-lens manual analyze (Trend + Value on one proposal)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `strategy/charter.md`, `strategy/playbook.md`, `.agents/data-format.md`, and `planning/value-sleeve-and-catalyst-spec.md` first. Refines the manual analyze-a-symbol UX: instead of picking ONE lens, run BOTH and show both breakdowns on one proposal, toggleable. One feature branch + PR._

## Change
Replace the single Trend/Value **lens picker** on manual analyze-a-symbol with **automatic dual-lens evaluation**:
- Entering a ticker runs the full pipeline under **both** the **trend** and the **value** mandate, producing **one analysis** with two strategy breakdowns.
- Each lens carries its own: thesis, checklist, levels (entry/stop/target — may differ by lens), conviction, and **red-team verdict** (each judged by its matching mandate, per the value-sleeve spec).
- **Both verdicts visible at a glance** — a summary line on the card, e.g. `Trend: reject · Value: concern`, before any toggle.
- A **Trend / Value toggle** switches the detailed breakdown (checklist + red-team reasoning + levels) for the selected lens.

## Approval
- Approving still places **one order** (the buy/sell at its levels) through the normal gated flow. **Record which lens the human acted under** in the journal (the toggle's active lens at approval = the recorded rationale), so the decision basis is auditable + useful for training.
- If the two lenses imply different levels, the **active (toggled) lens determines the order's levels**; surface that clearly before the AlertDialog confirm.
- Hard risk rails + the two gates are unchanged; a weak pick under both lenses is still flagged, not rubber-stamped.

## Scope & cost
- **Dual-lens applies ONLY to the user-initiated manual analyze** (bounded — one symbol per click; respects the Perplexity daily cap; both lenses on one symbol is a few calls, fine).
- **Discovery stays single-lens per candidate** (best-fit bucket from the value-sleeve spec) — do NOT dual-evaluate every discovery candidate; that would double Codex/Perplexity cost across the daily funnel.

## Acceptance
- A manual analyze produces **one** proposal/analysis with both Trend and Value breakdowns, a glanceable dual-verdict summary, and a working toggle.
- Approving records the acting lens; the active lens drives the order levels when they differ.
- Discovery is unaffected (single-lens); manual dual-lens respects the Perplexity cap.
- Hard rails + gates unchanged; light + dark + a11y (toggle is keyboard-accessible; both verdicts are in the accessible name/summary). Tested.

## Out of scope
- Dual-lens in discovery; execution/gate changes; loosening hard rails.
