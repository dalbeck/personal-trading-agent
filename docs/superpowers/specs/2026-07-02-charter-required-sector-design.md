# Design — Charter: sector required to place a buy

**Date:** 2026-07-02
**Branch:** `chore/charter-required-sector`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — Charter improvement #9.
**Series:** second charter/playbook sub-branch (after CB1 shorts).

## Problem

The concentration rail `sectorConcentration` does `if (!sector) return null` —
it **fails open** on an unknown sector. Since `sector` is set by the discovery
LLM / research (and can be null), a buy with no sector **skips the 40% sector
cap entirely** — the cap is bypassable by omission.

## Approach — enforce at the rail, human-overridable

- **Risk engine** (`src/lib/risk/validators.ts`): a new `sectorRequired` rule —
  a **buy entry** (`isEntry`) with `sector == null` returns
  `{ rule: "sector-required", message: … }`. Added to `RULES` **before**
  `sectorConcentration` (which keeps its known-sector logic). A buy the desk
  can't classify is now **blocked**, so the 40% cap can't be skipped.
- **Placement-time, not creation-time.** Research-unavailable creation paths
  legitimately produce a null-sector proposal, which should still be recorded,
  visible, and fixable. The rail gates *placement*: the autonomous paper batch
  **rejects** a null-sector buy; the human path can **consciously override**
  (rail violations clear on a valid override comment) or resolve it by refreshing
  research. Fail-closed by default; the human keeps control. The schema keeps
  `sector` nullable.
- **Charter** (`strategy/charter.md`): update the sector-concentration rail
  bullet — a **known sector is required to place a buy** (a null-sector buy is
  blocked, human-overridable); add a change-log entry.

## Testing (TDD)

- A **buy** with `sector: null` → a `sector-required` violation (blocked).
- A buy **with** a sector → no `sector-required` (regression).
- A **sell** with no sector → no `sector-required` (entries only).
- Base fixtures that omit `sector` (e.g. `baseOrder`, `ORDER`, buy-proposal
  fixtures) gain a realistic `sector` so they still pass — a real buy carries one;
  the dedicated no-sector tests keep it explicit.
- Full suite + typecheck + lint stay green.

## Out of scope (later charter sub-branches)

Proposal-expiry, sleeve checklists + rules-view, value-quality bars,
earnings-blackout, discipline rules, charter doc-honesty pass.
