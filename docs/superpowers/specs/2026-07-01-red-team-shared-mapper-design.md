# Design — One shared red-team briefing mapper (H3)

**Date:** 2026-07-01
**Branch:** `fix/red-team-shared-mapper`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — **H3**.
**Series:** fourth remediation branch (C1, H1, H2 merged). H4 (verdict
invalidation) is the next branch — split per owner.

## Problem

Five call sites build the red-team prosecutor briefing inline, and each drops a
different subset of fields:

| Call site | Source | Drops |
| --- | --- | --- |
| `red-team-sweep.ts` | `TradeProposal` | `sleeve`, `targetWeightPct`, `reviewTriggerPct`, `cashFlow`, `dividend`, `researchStatus` |
| `execute.ts` (paper batch) | `TradeProposal` | `sleeve`, `catalystSources`, `catalystState`, `targetWeightPct`, `reviewTriggerPct`, `cashFlow`, `dividend`, `researchStatus` |
| `proposals/[id]/red-team` (re-run) | `TradeProposal` | `sleeve`, `targetWeightPct`, `reviewTriggerPct`, `cashFlow`, `dividend`, `researchStatus` |
| `live-order.ts` (approval fallback) | `ApprovalOrder` | `strategy`, `sleeve`, `targetWeightPct`, `reviewTriggerPct` (present on the order), + value fields (not on the order) |
| `api/red-team` (ad-hoc) | request body | lens + value fields |

A dropped lens means a **value** or **core-long** proposal is re-judged under
the default **trend** lens ("counter-trend is a strike", "missing stop" strike),
and dropped `cashFlow`/`dividend` means the value prosecutor can't see the floor
("no floor" reject). This defeats the charter's "never merge the lenses" design
and systematically kills valid value/core proposals.

`analyze-symbol.ts` (`redTeamInput`) and `refresh-levels.ts` already pass the
full briefing — they are the reference behavior.

## Approach — one structural mapper

### 1. `toRedTeamProposal(src: RedTeamBriefingSource): RedTeamProposal`

New module `src/lib/server/red-team-briefing.ts`. `RedTeamBriefingSource` is a
**structural** interface: the required core fields (`symbol`, `action`, `side`,
`qty`, `limitPrice`, `stopPrice`, `takeProfit`, `thesis`) plus every optional
briefing field (`strategy`, `sleeve`, `reasoning`, `research`, `targetType`,
`relativeVolume`, `catalyst`, `catalystType`, `sector`, `catalystSources`,
`catalystState`, `cashFlow`, `dividend`, `targetWeightPct`, `reviewTriggerPct`,
`researchStatus`). Both `TradeProposal` and the enriched `ApprovalOrder` satisfy
it — no forced conversion to one nominal type.

The mapper copies the fields and applies the **same value-lens gating** that
`buildProsecutorPrompt` uses:

```ts
const isValue = (src.sleeve ? sleeveToStrategy(src.sleeve) : src.strategy) === "value";
```

`cashFlow` / `dividend` / `researchStatus` are briefed for the value lens only
(null otherwise) — matching `redTeamInput`, so the two mappers never diverge.

### 2. Route the droppers through it

- `red-team-sweep.ts`, `execute.ts` (paper batch), `proposals/[id]/red-team`
  (re-run) — replace the inline object with `toRedTeamProposal(proposal)`.
- `api/red-team` (ad-hoc) — widen the request body to accept the briefing fields
  and pass the parsed body through `toRedTeamProposal`.

### 3. Approval fallback — full briefing (owner's choice)

- Add `cashFlow`, `dividend`, `catalystState`, `catalystSources`,
  `researchStatus` to `ApprovalOrder`.
- Populate them from the proposal in the approve route
  (`src/app/api/live/approve/route.ts`) where the order object is built.
- Delete `live-order.ts`'s local `toRedTeamProposal(o: ApprovalOrder)` and call
  the shared mapper (the enriched `ApprovalOrder` satisfies the interface).

### 4. analyze-symbol / refresh-levels

Left as-is (their source is `ManualProposalDraft`, and `redTeamInput` already
briefs the full set). A **parity test** asserts the shared mapper and
`redTeamInput` handle the shared briefing fields identically for equivalent
inputs, so the two can't drift.

## Testing (TDD)

- **Field-completeness** (eval-requested): a fully-populated **value**
  `TradeProposal` → the mapped `RedTeamProposal` carries every value-briefing
  field (`sleeve`, `cashFlow`, `dividend`, `catalystState`, `catalystSources`,
  `researchStatus`, `targetWeightPct`, `reviewTriggerPct`). A **trend** proposal
  → value fields null, `strategy`/`sleeve`/lens fields present. Adding a new
  `RedTeamProposal` field without updating the mapper fails this test.
- **Value-lens gating:** a value proposal briefs `cashFlow`; the same fields on a
  trend proposal are nulled.
- **Per-call-site:** the sweep, paper batch, re-run route, and approval fallback
  each brief `sleeve` + the value fields (asserted via a `runRedTeam` /
  `buildProsecutorPrompt` spy or on the mapped object).
- **Parity:** shared mapper vs `redTeamInput` agree on the shared fields.
- Full suite + typecheck + lint stay green.

## Out of scope (follow-ups)

- **H4** verdict invalidation (timestamp + content hash; re-run on stale/edit).
- Routine `Bash(curl:*)` narrowing and **C2** (still parked).
