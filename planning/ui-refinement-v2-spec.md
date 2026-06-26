# Build Spec — UI refinement v2 (serif/sans, richness, real de-densifying)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/design-system.md`, `.agents/nextjs.md`, and `planning/plaid-ui-rework-spec.md` first. A second design pass: the first one (over-indexed on Mercury austerity) read as flat/mundane and didn't actually reduce felt density. **This pass adds structured visual richness and fixes density through hierarchy + whitespace.** Each milestone = its own branch + PR. Presentation only._

## Recalibration (supersedes the earlier "remove decoration / one accent" emphasis)
- **Restraint means avoiding clutter — NOT avoiding color, gradients, or a serif face.** Beauty comes from *structured* richness + clear hierarchy, not from austerity.
- **Density is fixed by hierarchy and whitespace, not by stripping elements:** fewer things per zone, one clear focal point per page, big gaps between sections, progressive disclosure of detail.
- Keep the Plaid dark system + blue accent + gain/loss; this pass *adds* a serif display face, gradient heroes, tinted zones, and richer proposal formatting on top.
- **Anti-stale mandate (especially LIGHT mode):** the current light mode reads as a flat-gray admin template — that's the "stale" the owner keeps flagging. Fix it: **white cards with real soft shadows / elevation** on a soft-gray canvas (not flat gray boxes with hairline borders), a **bold gradient hero** (vibrant blue/indigo, white text — not a gray card), **color and depth** used confidently, and **vibrant data-viz**. Push toward "fresh, modern, flashy fintech" (Finance D / FiraCast energy), not austere. Both modes get this; verify **light mode specifically** no longer looks like a generic dashboard template.

## M1 — `feature/serif-typography`
Pair a **serif for headings/display + sans for content**:
- Add a serif display face via `next/font` — recommend **Fraunces** (variable, premium; alt: Newsreader or Source Serif 4). Keep **Inter** for body, labels, and **all numbers/data**.
- **Rule (updated):** serif for page titles, section titles, card headlines (ticker/company name), **and large DISPLAY numbers** — the hero equity figure, big KPI numbers, the risk-posture score, headline P&L. **Keep sans `tabular-nums` for dense/aligned numbers** — table cells, list rows, small inline figures, and anything in a column that must align. So: serif = big editorial figures; sans-tabular = data-grid numbers.
- Update `.agents/design-system.md` typography + the Tailwind theme + the type scale (serif sizes for h1/h2/section title; sans for the rest).
- **Acceptance:** serif headings render (with a graceful fallback), sans body/numbers; clear, premium headline↔content contrast; light + dark.

## M2 — `feature/visual-richness`
Add the structured richness that was missing:
- **A gradient hero per page** — one focal card (equity/account on Overview, the headline metric elsewhere) with a subtle dark gradient + a soft radial glow + the big number. This is the page's anchor.
- **Tinted zones / header strips:** subtle accent-tinted gradients on section headers and key card headers to break up the grid (e.g. `linear-gradient(90deg, rgba(accent,0.10), transparent)`).
- **Subtle patterns/textures** used sparingly (faint dot/grid behind a hero, diagonal-stripe fills on a highlighted bar) — never on whole backgrounds.
- **Visual rhythm:** not every card identical — a hero card, flatter secondary cards, varied sizes. Avoid the uniform grid that reads as mundane.
- Update the design-system "tone" note to this recalibration (richness allowed; restraint = no clutter, not no color).
- **Acceptance:** each main page has a clear gradient focal point; sections are visually distinct; the page no longer reads as a flat uniform grid; still tasteful (not busy); light + dark.

## M3 — `feature/proposal-reformat`
Reformat the proposal card into clear **zones** (overview module + Proposals view + approve dialog):
1. **Header strip** (subtle tint): serif **ticker** + company name + side pill + status tag.
2. **Thesis** as a readable lead line (sans ~15px, comfortable line-height) — not buried in a paragraph.
3. **Key stats as a chip row:** est. cost, risk, R:R, confidence.
4. **R:R bar** as the hero visual (stop / entry / target).
5. **Red-team verdict** as a distinct **semantic callout block** (left accent border + tint by verdict), clearly separated from the thesis.
6. **Full reasoning / checklist behind a "Details" expander** (progressive disclosure) — never a wall of text by default.
7. **Actions** row.
- **Acceptance:** proposals read as scannable zones, not a text dump; the red-team callout is visually distinct; detail is one expander away; reformat applies everywhere proposals render; light + dark + a11y.

## M4 — `feature/density-hierarchy-pass`
A hierarchy + whitespace pass across the densest pages (Overview, Evaluation, Journal, Positions):
- One clear **focal point** per page; **bigger gaps between sections** (serif section titles as chapter breaks); **fewer, larger** elements per zone; **progressive disclosure** of secondary detail.
- **Acceptance:** the dense pages feel calmer and more readable at a glance; nothing important lost (behind expanders, not removed); light + dark.

## M5 — `feature/read-more-modal`
Keep all the detail/context, but move it out of the inline flow into a **formatted modal**:
- A "Read more" / "Details" trigger opens a **modal dialog** with the full proposal context, **structured into sections** (not a text dump): thesis, the **pre-trade checklist** (each item with a pass/flag chip), **sizing math**, **research highlights** (Perplexity Finance), the **full red-team reasoning**, and any linked journal entry.
- Modal requirements: scrollable body, focus-trap, Esc + backdrop dismiss, `aria-modal`, returns focus to the trigger, respects reduced-motion. Reuse the same formatted-detail component for long journal entries / research where it helps.
- **Acceptance:** the card stays scannable; "Read more" opens a well-formatted, sectioned modal with the complete context; fully keyboard + screen-reader accessible; light + dark.

## M6 — `feature/risk-posture-meter`
A visual **risk posture** gauge (Conservative ↔ Aggressive) at the top of Overview (+ a compact variant on other pages), computed from **real signals — never a vibe**:
- Inputs (weighted into a 0–100 posture score): **% equity deployed** (vs cash), **concentration** (top-name % + sector), **open positions vs the 5-cap**, **avg risk-per-trade vs the 2% rail**, **drawdown proximity to the −10% halt**, and (optional) whether the human has loosened/disabled rails in risk-settings. Map to Conservative (<33) / Moderate (33–66) / Aggressive (>66).
- **Show the contributing factors** (the breakdown bars) so it's transparent, not a black box. Per book (paper / live) following the mode toggle.
- **Sleek gauge design (build this version):** a single **gradient arc** (teal → amber → red) that **fills to the score** via `stroke-dasharray` (no hard segment joins), a **glowing indicator dot** riding the arc at the reading, the **score number + level read out in the center well**, thin quiet factor bars, and a **one-line plain-language summary** of what the posture means ("Balanced posture — moderate exposure with one concentrated name"). Card gets a subtle gradient surface + serif title. Rounded caps, restrained glow, ≤200ms if animated, reduced-motion aware.
- **Honesty:** label it a **snapshot of current posture, not a prediction or a safety rating**; a glossary tooltip explains exactly what drives it. Make the computation a **pure, unit-tested** function (inputs → score + factors + the summary sentence).
- **Acceptance:** the gauge fills to the live score with the glowing indicator + center readout + summary line; the factor breakdown reflects the snapshot; the score function is pure and tested; the "what drives this" tooltip is present; honest framing; light + dark + a11y (gauge has a text equivalent).

## M7 — `feature/polish-pass`
Tasteful modernization within the restraint guardrails:
- Subtle **micro-interactions** (hover lift/tint on cards, ≤200ms, transform/opacity only, reduced-motion-aware); refined **focus states**.
- **Refined empty states** with a small illustrative/icon moment (ties to the sample-data honesty rule — honest, not fake data).
- **Number-format polish:** consistent abbreviations ($1.2k / $3.4M), explicit +/− signs, gain/loss color, `tabular-nums` everywhere.
- **Loading skeletons** for async surfaces; refined dividers/spacing rhythm.
- **Acceptance:** the app feels polished and modern but still calm (not busy); interactions are subtle and accessible; light + dark.

## M8 — `feature/proposals-slim-table`
Replace the Proposals view's stack of heavy cards with a **slim, scannable table grouped by proposal date**:
- Date group headers ("Today · Jun 26", "Yesterday", …); slim rows.
- Columns: ticker + company, side pill (buy/sell), R:R (`tabular-nums`), red-team verdict pill, confidence, status, and a chevron.
- **Row click opens the full detail** (the M5 formatted modal — or a detail route) with the complete context. Row hover state; keyboard-navigable rows.
- Apply the same slim-table + click-to-detail pattern to other heavy lists where it fits.
- **Acceptance:** the Proposals page is a slim date-grouped table; clicking a row opens the full formatted detail; scannable, not a card wall; light + dark + a11y (rows are real buttons/links).

## Out of scope
- Data / logic / gate / execution changes; the symbol chart's internals; animation beyond subtle ≤200ms.
