# Build Spec — Approval Proximity meter (new proposal component)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/nextjs.md`, `.agents/design-system.md`, `.agents/data-format.md`, and the proposal detail page + proposal schema first. Follow `.agents/workflow.md` — one branch + PR, pause at the end._

## Why
On a proposal page the owner wants to gauge **at a glance how close the red-team is to approval vs. rejection** — "is this a hard reject, a borderline call, or basically a go?" — without parsing the factor prose. Build this as a **brand-new, read-only component**. **Do NOT modify the existing red-team block or any other existing component** — additive only.

## Honesty constraint (non-negotiable — read before coding)
The red-team verdict is a **categorical LLM judgment** (`approve` | `concern` | `reject` + factors), **NOT** a numeric/probabilistic score. The meter must be a **derived, transparent interpretive reading**, never presented as a probability the model emitted. Two rules:
1. **The meter can never contradict the verdict.** It is *anchored* to the verdict band (below), and only *modulated within* that band by the supporting signals.
2. **It is clearly labeled** as interpretive — subtitle e.g. _"Interpretive reading of the red-team's categorical verdict, conviction, and data completeness — not a probability the model produced."_

## Component — `ApprovalProximityMeter`
A single new component placed in the **proposal page sidebar** (the main content column is already long — this is an at-a-glance aid that belongs in the rail, not inline). Read-only; computed from existing proposal fields via a small **pure helper** (`deriveApprovalProximity(proposal)`), no new model calls, no red-team logic changes. It is a **separate** component from the red-team block (which stays in the main column, untouched) — the sidebar meter is the quick read, the main block is the detail.

**Placement:** add it to the proposal detail sidebar/rail (find the existing sidebar container; if the page has no sidebar yet, match the existing two-column proposal layout rather than inventing a new one — verify the current layout before placing). It should sit near the top of the rail so the verdict read is visible without scrolling. Compact enough for a sidebar width (~280–320px).

### The 0–100 derivation (transparent, banded)
**Verdict sets the band** (so the number always agrees with the verdict):
- `reject` → **0–33** ("Far off — stay away")
- `concern` → **34–66** ("Borderline — close call")
- `approve` → **67–100** ("Clear — proceed")

**Within the band, modulate by the real signals** (document the exact weights in the helper; keep them as named constants, no magic numbers buried in JSX):
- **Factor pressure:** more/blocking reject-type factors push toward the band floor; fewer/softer concern factors push toward the ceiling.
- **Conviction score** (the existing numeric `scoreValueConviction`): higher nudges up within the band, lower nudges down.
- **Data completeness:** missing structured data (e.g. `cashFlow` / `dividend` null/unavailable) **caps the score below the band ceiling** — you can't read as "clear/high" on an incomplete file. (Consistent with the conviction-honesty principle: unknown data must not inflate confidence.)

Verify the exact field names (`verdict`, factor array + any severity/type tags, `scoreValueConviction`, `cashFlowSource`/`dividendSource`/null flags) against the actual proposal schema before wiring — don't assume.

### Visual (per design-system.md — dark Plaid-derived, serif display numerals)
- A horizontal meter (or radial gauge) with three colored zones — **red 0–33 / amber 34–66 / green 67–100** — and a marker at the derived value.
- The **numeric value** in the serif display face (Fraunces), with the **band label** beside it ("Borderline — close call").
- A short **"what's moving it"** list: the top 2–3 signals pulling the score down or up (e.g. "− 2 blocking factors", "− cash-flow data missing", "+ conviction 71"). This keeps the number from being a black box.
- The interpretive-label subtitle from the honesty constraint.
- Accessible: not color-only — include the text label + an aria-label stating value, band, and that it's a derived reading.

## Acceptance
- A new `ApprovalProximityMeter` renders on the proposal page; the existing red-team block and all other components are **untouched** (diff shows only additions + the new file + its placement).
- A `reject` proposal reads in 0–33 with red zone + "Far off"; a `concern` reads 34–66 amber; an `approve` reads 67–100 green — the meter **never** disagrees with the verdict.
- A proposal with missing cash-flow/dividend is **capped below the band ceiling** and the "what's moving it" list names the missing data.
- The subtitle labels it as an interpretive reading, not a model probability.
- `deriveApprovalProximity` is a pure function with unit tests covering: each verdict band, factor-pressure modulation, conviction modulation, and the data-completeness cap.

## Visual reference (approved mockup)
A four-state mockup was reviewed and approved. Build to match it, adapted to the dark design system and sidebar width.

**Layout per meter:**
- Header row: a `gauge` icon + the label "Approval proximity" (muted, 13px, weight 500) on the left; a **verdict pill** on the right tinted to the verdict (`reject`→danger, `concern`→warning, `approve`→success role tokens).
- Value row: the **0–100 number in the serif display face** (Fraunces / `--font-voice`), large (~40px), colored to the band; beside it the **band label** ("Far off — stay away" / "Borderline — close call" / "Clear — proceed") in secondary text.
- The **banded track**: a single horizontal bar split into three fixed zones — **red 0–33 / amber 34–66 / green 67–100** (flex 33 / 33 / 34) — with an 8px radius. A 3px vertical **marker** at the derived value: `left: value%`.
- The **"what's moving it" row**: 2–3 chips with up/down arrows naming the top contributing signals (e.g. "↓ 3 blocking factors", "↑ conviction 64", "↑ full data coverage"). Up = success color, down = danger/warning per pressure direction.
- A single shared **italic interpretive subtitle** at the bottom: _"Interpretive reading of the red-team's categorical verdict, conviction, and data completeness — not a probability the model produced."_

**Data-completeness cap rendering (the honesty cue):** when structured data is missing, the score is capped below the band ceiling. Render a **faint secondary marker at the cap position** (e.g. the 60-line in the mockup), the value marker sits at/below it, and a `lock` icon chip reads "capped — cash-flow data missing". This makes "the number can't go higher because data is incomplete" legible at a glance.

**Marker math:** `markerLeft = clamp(proximity, 0, 100) + '%'`; the band boundaries are fixed at 33% and 67% regardless of value. Round the displayed number with `Math.round`.

Colors come from the design-system role tokens (danger/warning/success bg + text), never hardcoded hex — so it works in dark mode. Don't color-encode only: every state keeps its text label + verdict pill + aria-label.

## Out of scope
- Any change to the red-team itself, the verdict, the conviction score, gates, or hard rails. The meter is advisory/visual only and feeds nothing downstream.
