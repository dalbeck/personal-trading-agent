# Build Spec — dedicated proposal detail page + PDF/MD export

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/nextjs.md`, `.agents/design-system.md`, `.agents/data-format.md`, and `planning/dual-lens-analyze-spec.md` first. Replaces the full-context **modal** with a dedicated page, and adds export. Each milestone = its own branch + PR. No data/logic/gate changes._

## M1 — `feature/proposal-detail-page`
Replace the proposal full-context **modal** with a dedicated route **`/proposals/[id]`**:
- The slim proposals table **row click navigates here** (no more modal for full context). Keep the slim table as the index.
- Spacious, well-organized layout (use the room a full page gives — apply the design system + the calm/serif treatment):
  - **Header:** ticker + company, side pill, **strategy badge(s)**, status, and — for dual-lens analyses — the **glanceable dual-verdict summary** (`Trend: reject · Value: concern`) + the Trend/Value **toggle**.
  - **Sections:** thesis, pre-trade checklist (pass/flag chips), sizing math + R:R bar, research, **red-team reasoning** (per lens / following the toggle).
  - **Actions:** Reject / Approve (the normal gated flow, unchanged) + Re-run red-team + Refresh research, on the page.
- Sensible back-navigation; deep-linkable (an `/proposals/[id]` URL opens that proposal). Light + dark + a11y.
- **Acceptance:** clicking a proposal opens its own page (modal removed for full context); the page shows the complete, well-organized context incl. dual-lens toggle; approve/reject still works through the gates; deep-linkable; light + dark + a11y.

## M2 — `feature/proposal-export`
Add **Export** (PDF + Markdown) on the detail page:
- **Markdown export:** serialize the full proposal to a `.md` file — YAML frontmatter (id, symbol, side, strategy, date, verdict(s), conviction) + sections (thesis, technicals, checklist, sizing math, research, red-team reasoning per lens). Follows `.agents/data-format.md` narrative conventions.
- **PDF export:** a clean, paginated PDF of the full proposal (both lenses when dual). Prefer a **consistent server-rendered PDF** (render a print view of `/proposals/[id]` to PDF — reuse Playwright if it's already available, or a light HTML→PDF lib) over the browser print dialog, so the artifact is deterministic. A print stylesheet is an acceptable fallback.
- Both exports include the **full context** and a footer: snapshot timestamp + "point-in-time snapshot — not investment advice."
- Files **download to the user** (their own data; fine to download).
- **Acceptance:** Export → PDF and Export → MD both produce a complete, well-formatted file with all sections + both lenses when present + the snapshot/disclaimer footer; deterministic PDF; tested (the MD serializer is a pure, unit-tested function).

## Notes
- This supersedes the proposal **modal** (M5 read-more) — the modal pattern may remain for other quick details, but proposals now get a page.
- No execution / gate / hard-rail changes; exports are read-only.

## Out of scope
- Exporting other entities (later if wanted); emailing/sharing exports; data/logic changes.
