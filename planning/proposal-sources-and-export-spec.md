# Build Spec — proposal source footnotes, export actions, lens-aware meter

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/nextjs.md`, `.agents/design-system.md`, `.agents/data-format.md`, the proposal detail page, the `ApprovalProximityMeter`, the existing export (PDF/Markdown) code, and the proposal data model first. Follow `.agents/workflow.md` — each milestone = its own branch + PR, pause after each._

## Context
The proposal page now renders FMP cash-flow, the dual-lens toggle, and the sidebar proximity meter. Three additions: (M0) make the meter consistent with the lens toggle + fix a false data-cap; (M1) per-metric **source footnotes** so every number's provenance (Alpaca / FMP / Perplexity / derived) is visible; (M2) **Copy Markdown** + **Export JSON** actions.

## M0 — `feature/proximity-meter-lens-aware` (REQUIRED — owner confirmed lens-aware)
Two correctness fixes to the existing `ApprovalProximityMeter`. **Do not rebuild it** — adjust inputs only.
- **Lens-aware:** the rest of the page (thesis, checklist, sizing math) re-renders on the Trend/Value toggle, but the meter reads the proposal-level verdict and stays static. Make it derive from the **currently-toggled lens** — that lens's `redTeam.verdict`, `convictionScore`, and data completeness — so it updates with the toggle. (When both lenses match, it looks the same — that's fine; the point is it stays consistent when they differ.)
- **Fix the false data-completeness cap:** distinguish **"not applicable"** from **"missing."** A non-dividend payer (e.g. NOW) has `dividend: null` *because the company pays none* — that must NOT trigger a "dividend data missing" cap. Only cap for data that was **expected but unavailable** (e.g. cash-flow we tried to fetch and failed). Use the source/status tags (`dividendSource`, `cashFlowSource`, `researchStatus`) to tell "absent by nature" from "fetch failed." For NOW today (cash-flow present from FMP, no dividend by nature) the file is **complete** → no cap at all.
- **Acceptance:** toggling Trend/Value updates the meter's value + band; a non-payer with cash-flow present shows **no** "missing data" cap; a genuinely failed cash-flow fetch still caps; unit-tested for both the lens switch and the applicable-vs-missing distinction.

## M1 — `feature/proposal-source-footnotes`
Make every displayed metric's **source** visible via jump-linked footnotes.

### Provenance model (tag at the data layer — never guess)
Each displayed metric must carry a source tag. Known mappings (verify against the actual producing code before wiring):
- **Alpaca — market data:** entry/limit, stop, SMA20/50/200, ATR14, relative volume, "price now". 
- **Alpaca News (Benzinga):** the catalyst + its headline/url/publishedAt — already present in `catalystSources` (`publisher: "benzinga"`); use the real URL as the source link.
- **FMP** *or* **Perplexity:** cash-flow (FCF, FCF yield, OCF, net debt, leverage, coverage) per the existing `cashFlowSource`; dividend fields per `dividendSource`.
- **Perplexity:** analyst consensus + narrative summary.
- **Derived (agent):** computed values — reward:risk, risk %, quantity, conviction score, model confidence, sizing. Tag these **"Derived"**, NOT a data provider — they're calculated, not sourced. Being honest here matters.
- If a field's provenance isn't tracked yet, **add the tag at the producing layer**; if it genuinely can't be determined, label it "source not tracked" rather than attributing a guess.

### Footnote registry + inline markers
- Build a registry of the **unique sources** used on the page. Each entry: provider name, what it provided (the fields/sections), the relevant timestamp (`researchAt` / `pricedAt`), and a link where one exists (e.g. the Benzinga URL). Assign each a footnote number.
- Render small **superscript footnote markers** next to each metric/section, as **anchor links** that jump to the Sources component. Metrics sharing a source share a number.

### Sources component (new — sidebar, under Export)
- A new card in the **sidebar, placed directly under the Export card** (per the request). It's the canonical, numbered Sources list and the jump-link target. On narrow screens where the sidebar stacks below the main column, it naturally lands at the bottom of the page — satisfying "footnote sources at the bottom" with a single source of truth (don't render the list twice).
- Each numbered entry: provider · what it backed · timestamp · link (if any). Group by source, not per-field, to stay compact.
- **Accessibility:** markers are real links with `aria-label` (e.g. "source 2: FMP"); list items carry matching `id`s; jump-link focus lands on the target.
- **Acceptance:** every displayed metric shows a footnote marker; clicking a marker jumps to the sidebar Sources card; for the NOW proposal the markers resolve to — technicals → Alpaca, cash-flow → FMP, catalyst → Alpaca News (Benzinga) with the real URL, narrative/consensus → Perplexity, R:R / sizing / conviction → Derived; nothing is attributed to a provider it didn't come from; tested.

## M2 — `feature/proposal-export-actions`
Extend the Export card from two actions to four. **Reuse existing generators — don't fork the markdown.**
- **Copy Markdown:** copy the **same** markdown the existing Export Markdown produces to the clipboard via `navigator.clipboard.writeText`, with a transient "Copied" confirmation state on the button. No file download.
- **Export JSON:** download the **raw proposal object** (the canonical stored shape — same structure as the persisted proposal file) as `<proposal-id>.json`.
- Keep Export PDF and Export Markdown unchanged; group all four in the Export card with clear labels/icons.
- **Acceptance:** Copy Markdown writes the markdown to the clipboard and shows a confirmation; Export JSON downloads valid JSON that round-trips against the proposal schema; the two existing exports are byte-for-byte unchanged; tested (clipboard write mocked, JSON validated against the schema).

## Out of scope
- Changing the red-team, conviction logic, gates, hard rails, or the data providers themselves. Source tags only *report* provenance — they don't change any value. No new external calls.
