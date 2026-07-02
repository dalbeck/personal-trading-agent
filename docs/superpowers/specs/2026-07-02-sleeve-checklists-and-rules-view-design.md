# Design — Sleeve checklists, rules-view lenses, glossary tooltips

**Date:** 2026-07-02
**Branch:** `chore/charter-sleeve-checklists`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — Charter improvement #5.
**Series:** fourth charter/playbook sub-branch.

## Problem

The prosecutor prompt has full **core-long** and **position-mid** mandate
guidance, but:
- the playbook's core/mid checklists are prose sketches, not enumerated like
  trend/value;
- `red-team-rules.ts` (the Strategy page's "read live from the prosecutor's
  logic" rules view) has only `shared`/`trend`/`value` sections, so both sleeve
  lenses are invisible;
- jargon in the rules view has no layman explanation (owner preference:
  industry-standard terms **with tooltip helpers** — see the ui-terminology
  memory).

## Approach

### 1. Rules data — add the two lens sections
`src/lib/red-team-rules.ts`: extend the section `id` union with `"position-mid"`
and `"core-long"` (matching the `Sleeve` values) and add two sections whose
enumerated rules mirror the prosecutor's mid/core guidance in
`buildProsecutorPrompt`. Titles use standard horizon language ("Position lens —
mid-term", "Core lens — long-term hold"). Rules stay plain strings (the
single-source-of-truth the drift test checks).

### 2. Glossary tooltips (industry terms + layman defs)
- Add sleeve jargon to `src/lib/glossary.ts`: `value-trap`, `mean-reversion`,
  `measured-move`, `target-weight`, `review-trigger`, `expense-ratio` — real
  terms, plain definitions.
- New pure `tokenizeGlossary(text, seen)` (in `glossary.ts`): splits a string
  into plain segments and `{ term, text }` matches, wrapping the **first
  occurrence** of each term (tracked via a shared `seen` set → once per view,
  matching `<Term>`'s "primary appearance only" restraint). Uses a curated
  match table (`GlossaryKey → phrases[]`) so rule phrasing ("reward-to-risk",
  "value trap", "target weight") maps to the right entry without touching every
  glossary record.
- New `<GlossaryText text seen />` (client) maps tokens to `<Term>` / plain text.
- `red-team-rules-view.tsx` renders each section summary + rule through
  `<GlossaryText>` (one shared `seen` set across the view). No other UI change —
  the new sections render via the existing `.sections.map`.

### 3. Playbook checklists
`strategy/playbook.md`: add enumerated **Position (mid-term)** and **Core
(long-term)** checklists in the trend/value style + a change-log entry.

### 4. Drift-guard test
`red-team-rules.test.ts`: `RED_TEAM_RULES.sections` must have an entry for every
prosecutor lens, and **every `Sleeve`** must resolve to a present section — so
the rules view can't silently drift from the prosecutor again.

## Testing (TDD)

- `tokenizeGlossary`: wraps a known phrase once; respects the shared `seen`
  (second occurrence stays plain); leaves unknown text alone; maps a phrase
  variant to the right key.
- Drift-guard: all lenses + every sleeve covered by a section.
- Full suite + typecheck + lint stay green. UI auto-renders the new sections.

## Out of scope (later charter sub-branches)

Value-quality bars, earnings-blackout, discipline rules, charter doc-honesty pass.
