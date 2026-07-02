# Design — Charter: long-only / shorts prohibition

**Date:** 2026-07-02
**Branch:** `chore/charter-shorts-prohibition`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — Charter improvement #2.
**Series:** first of the charter/playbook sub-branches (after C1 + H1–H8).

## Problem

`TradeProposalSchema` supports `side: "short"`, and the risk engine has full
short-side handling (stop resolution, stop-vs-entry validation), so a short
proposal could clear the rails. But the charter's Universe says "**no margin**",
and shorting requires margin — so shorts are implicitly prohibited yet nowhere
stated or enforced.

## Approach

- **Charter** (`strategy/charter.md`, Universe): state it explicitly —
  **long-only, no short selling** (it requires margin, prohibited above) — and
  add a change-log entry.
- **Risk engine** (`src/lib/risk/validators.ts`): a new hard-gate rule

  ```ts
  export const noShorts: Rule = (o) =>
    o.side === "short"
      ? { rule: "no-shorts", message: "short selling is prohibited — long-only (no margin)" }
      : null;
  ```

  added to the `RULES` registry, so `evaluateOrder` **rejects** a short (journaled,
  not downsized; the LLM cannot override a rail). The schema keeps its
  `side` enum for type-compat — the risk engine is the single enforcement point,
  per the eval.

## Testing (TDD)

- A `side: "short"` order → a `no-shorts` violation (rejected); a `long` order is
  unaffected (regression) — asserted through `evaluateOrder` so the rule is wired
  into the registry, not just defined.
- Full suite + typecheck + lint stay green.

## Out of scope (later charter sub-branches)

Required-sector, proposal-expiry, sleeve checklists + rules-view, value-quality
bars, earnings blackout, discipline rules, and the charter doc-honesty pass.
