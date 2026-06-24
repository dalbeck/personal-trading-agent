# Phase 1.5 Build Spec — Chat rendering & data-format formalization

_Executable spec for a local Claude Code session. Read `AGENTS.md` + `.agents/*.md` first. Small, foundational phase — do it before Phase 2, because the routines and dashboard depend on a consistent data format and a safe markdown renderer._

## Why now
Phase 1 streams raw LLM text into the chat panel and stores seed data in an ad-hoc shape. Before the autonomous routines start writing journals/coaching/proposals at volume, lock in (a) how content is stored so the AI ingests it cleanly, and (b) how it's rendered safely.

## Milestones (each = feature branch + PR)

### M1 — `feature/markdown-rendering`
- Render dynamic LLM/agent markdown (chat output, journal entries, coaching notes) with **react-markdown + remark-gfm + rehype-sanitize**. **Do NOT use MDX for dynamic/LLM-generated content** — rendering untrusted MDX executes arbitrary JS. MDX is allowed only for trusted, static authored docs.
- Style the rendered output to the design system (`.agents/design-system.md`): headings, lists, tables, blockquotes, links, inline code, and fenced code blocks with syntax highlighting. `tabular-nums` in tables.
- Must render **streaming** markdown gracefully (partial/incomplete markdown as tokens arrive) without layout thrash.
- Sanitize all rendered HTML; open links safely (`rel="noopener noreferrer"`, no `javascript:` URLs).
- **Acceptance:** chat output and a sample journal entry render as styled markdown in both themes; a malicious payload (script tag, `javascript:` link, raw HTML) is provably stripped; streaming render is smooth.

### M2 — `feature/data-format`
- Codify the storage convention and write it to a new **`.agents/data-format.md`**:
  - **Narrative → Markdown + YAML frontmatter** (`data/decision-journal/`, `data/coaching-log/`, `data/chats/`). Frontmatter holds structured fields (id, timestamp, ticker, decision, review-date); body holds prose.
  - **Structured → JSON** (`data/snapshots/`, `data/proposals/`, `data/fills/`, `data/logs/`). Validated against the Phase 1 TypeScript contracts.
  - **MDX → trusted static docs only.**
- Migrate the Phase 1 seed fixtures to this convention; update the `lib/` readers and types accordingly.
- Add a tiny validator (script or test) that fails if a `data/` file violates its expected shape/frontmatter.
- **Acceptance:** all `data/` artifacts conform; readers parse both MD-frontmatter and JSON; validator passes; `.agents/data-format.md` documents the rules and is linked from `AGENTS.md`'s routing table.

## Out of scope
- Autonomous routines, risk engine, red-team (Phase 2). This phase only formalizes format + rendering.
