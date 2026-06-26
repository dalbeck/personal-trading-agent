# Build Spec — Overview as the design-system reference (compose, don't decorate)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/design-system.md`, `.agents/nextjs.md` first. **This supersedes the piecemeal UI tweaks.** Rebuild the Overview page as one fully-composed modern-fintech reference, then codify the patterns and propagate. The earlier passes failed because they polished components while the page stayed a flat vertical stack of equal-weight gray blocks showing data as text. Fix the **composition**, not the tokens._

## The five principles (encode these in `.agents/design-system.md`)
1. **Focal hierarchy.** Every page has ONE dominant hero that visually outweighs everything else. On Overview that's the **account equity + a large area chart**. Everything else is subordinate by size/weight. No more equal-weight stacked blocks.
2. **Visualize, don't tabulate.** Any data that can be a chart becomes one: equity → **area/line chart**; market regime → **sector-rotation diverging bars** (leaders green / laggards red); risk → **gauge**; KPIs → icon + serif number + **delta pill** + **sparkline**; portfolio mix → **ring**. Plain text tables of numbers are the enemy of "modern fintech."
3. **Depth & vibrancy.** A vibrant **gradient hero** (glow, color, white text), soft **elevation/shadows** in light mode (white cards on a soft-gray canvas — never flat gray boxes with hairline borders), layered surfaces in dark. Confident accent + gain/loss + a small categorical palette for charts.
4. **Composition & rhythm.** Use **multi-column grids** (main + sidebar), grouped sections, and **varied card sizes** — a big hero, medium feature cards, small stats. Not a uniform single-column stack.
5. **Type & detail.** Serif for headings + **large display numbers**; sans `tabular-nums` for data grids. Consistent iconography. Glossary tooltips on jargon.

## Charting
Use a real charting library consistently (reuse whatever powers the **symbol chart the owner already likes** — extend it to the equity curve + sparklines). Don't hand-roll each chart. Sector bars + gauge can be lightweight SVG components.

## M1 — `feature/overview-reference` (the north star)
Rebuild `/` (Overview) to the composed reference:
- **Hero zone:** account equity (serif, large) + delta pill + a **large area equity-curve chart** with range tabs (1W/1M/1Y), gradient fill, glowing endpoint. Vibrant gradient surface. This dominates the page.
- **Enriched KPI strip** (3–4): tinted icon + serif number + delta pill + optional sparkline (Total P&L, vs SPY, Cash, Day P&L).
- **Market regime → sector-rotation bars:** replace the text leaders/laggards table with horizontal **diverging bars** from a center line (green right / red left), with the VIX/regime chip. Keep the advisory-only label.
- **Risk posture gauge** (the sleek gradient-fill version) in a sidebar column, with its factor summary.
- **"Needs you"** as a prominent actionable card (count + quick links), not a thin strip.
- Clear hierarchy, depth, color, rhythm. **Both light and dark must read as a modern fintech product** — verify light mode no longer looks like an admin template.
- **Acceptance:** Overview matches the composed reference (hero chart dominant, KPIs enriched, regime visualized, gauge, needs-you); data is visualized not tabulated; light + dark both vibrant with real depth; a11y (charts have text equivalents); screenshots in both modes.

## M2 — `feature/design-system-from-reference`
Extract the Overview's patterns into `.agents/design-system.md` + reusable primitives: the five principles, the hero/gradient pattern, the chart components (area chart, sparkline, diverging bars, gauge, ring), the enriched KPI card, elevation/shadow scale, and the serif-display-number rule. This becomes the binding system.
- **Acceptance:** the design system documents the principles + primitives; the Overview is built from those primitives (not one-off markup).

## M3 — `feature/propagate-system`
Apply the system to the other pages (Evaluation, Positions, Decision Journal, Strategy, Risk settings, etc.): one focal point each, data visualized, the shared primitives, depth + rhythm. Dense lists use the slim date-grouped table + click-to-detail.
- **Acceptance:** every page uses the primitives and a clear focal hierarchy; no page is a flat stack of gray blocks; light + dark.

## Out of scope
- Data / logic / gate / execution changes; the symbol chart's internals (reuse it); animation beyond subtle ≤200ms.
