# Design — Charter/playbook doc-honesty pass

**Date:** 2026-07-02
**Branch:** `chore/charter-doc-honesty`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — Charter improvements #1, #4, #10.
**Series:** sixth charter/playbook sub-branch. Pure documentation — no code.

## Three honesty fixes

### 1. Known-gaps caveat for broker-side stops (charter #1)
The charter's **"Stop on every swing"** reads as a fully-enforced fact, but on
the **live** path only the entry limit is placed — the stop lives in the journal
and is not yet placed broker-side after fill nor monitored intraday (the H6 gap,
not yet built). Add an honest caveat: the stop is defined at decision time and
drives sizing/risk on every path, but **live broker-side stop placement +
intraday monitoring is a known gap** (the human manages the live stop until H6
lands). Note the drawdown kill (H1) and the SPY/VIX emergency stop are now
code-enforced (fixed) so their bullets stay as-is.

### 2. Trend-target contradiction (playbook #4)
Trend checklist item 9 permits a **`fundamental`** target, but the trend mandate
is technically anchored (Analytical identity / Strategy identity: a
valuation/fundamental-led thesis is out of mandate). Fix item 9 so the **trend**
target must be **technically** anchored (`prior_high` / `measured_move` /
`atr_multiple`) — `fundamental` is appropriate for the **value / mid / core**
sleeves only (their checklists already say so), never the trend checklist.

### 3. Banked-lesson provenance (playbook #10)
The playbook requires each banked lesson to carry a date + source tag; two of the
three lack them. They cannot be honestly back-dated (the source wasn't recorded),
so tag them explicitly as **legacy / pre-provenance** rather than fabricate a
date — honest, and satisfies "tagged properly."

## Testing

Documentation only — no code paths change. Run the full suite + typecheck + lint
to confirm nothing regresses (the numeric tripwire tests are unaffected — no
number changed).

## Out of scope

Earnings-blackout N and the discipline rules (their own sub-branches); H6 itself
(the broker-side stop implementation the caveat points to).
