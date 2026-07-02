# Design — Red-team verdict invalidation (H4)

**Date:** 2026-07-01
**Branch:** `fix/red-team-verdict-invalidation`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — **H4**.
**Series:** fifth remediation branch (C1, H1, H2, H3 merged).

## Problem

A stored `RedTeamVerdict` has no timestamp and no content hash. The approval
path reuses `order.redTeam ?? runRedTeam(...)` (`live-order.ts:472`) however old
the verdict is, and a briefing change (levels, research) does not invalidate it.
So a stale or now-mismatched verdict can gate a real order. There is no manual
thesis-edit path today, but `refresh-research` rewrites the value briefing while
keeping the old verdict, and time passes between judging and approval.

## Approach

### 1. Schema — timestamp + hash on the verdict

Add to `RedTeamVerdictSchema` (`src/lib/schemas.ts`, currently `.strict()`):

```ts
judgedAt: z.string().nullable().default(null),   // ISO time the verdict was produced
judgedHash: z.string().nullable().default(null), // hash of the judged briefing
```

Both nullable + default null so pre-existing records still validate (and a
null-stamp verdict is treated as stale → re-run).

### 2. One canonical hash — `redTeamVerdictHash(briefing)`

`redTeamVerdictHash(briefing: RedTeamProposal): string` — sha1 over a **fixed,
key-sorted, null-normalized** subset of the decision-relevant fields: `symbol`,
`action`, `side`, `qty`, `limitPrice`, `stopPrice`, `takeProfit`, `targetType`,
`strategy`, `sleeve`, `catalyst`, `catalystType`, `catalystState`, `sector`,
`targetWeightPct`, `reviewTriggerPct`, `cashFlow`, `dividend`, `thesis`.

Computed by ONE shared function so an unchanged proposal hashes identically
whether the briefing came from analyze-time (`redTeamInput`) or approval-time
(`toRedTeamProposal`) — no false re-runs. Lives next to the mapper in
`red-team-briefing.ts`. `undefined`/`null` normalize to the same token, and
object fields (`cashFlow`/`dividend`) are serialized with sorted keys.

### 3. `runRedTeam` stamps the verdict

`runRedTeam(briefing, opts)` stamps `judgedAt` (from an injectable `opts.now`,
default the live clock) and `judgedHash = redTeamVerdictHash(briefing)` on every
verdict it returns — including the fail-closed reject, so even an unavailable
prosecutor's verdict carries provenance.

### 4. `isVerdictFresh(verdict, briefing, opts)`

Returns false when any of: `judgedHash` is null or ≠
`redTeamVerdictHash(briefing)`; `judgedAt` is null/unparseable; or the age
exceeds the TTL. Default TTL **24h**, exported as `RED_TEAM_VERDICT_TTL_HOURS`
from `src/lib/red-team-model.ts` (a red-team-subsystem constant, not a charter
risk limit — pinned by a unit test rather than a charter-doc tripwire).
Injectable `now`/`ttlHours` for tests.

### 5. Approval reuse — fail closed on stale

`evaluateApprovalBlocks` (`live-order.ts:472`): compute the current briefing via
the shared mapper, then use the stored verdict only when
`order.redTeam && isVerdictFresh(order.redTeam, briefing)`; otherwise re-run
`runRedTeam` (which already fails closed to a reject on prosecutor error).

### 6. Sweep re-judges stale verdicts

`sweepPendingRedTeam` (`red-team-sweep.ts`): judge a proposal when
`!p.redTeam || !isVerdictFresh(p.redTeam, toRedTeamProposal(p))`, not only when
the verdict is absent. A stale verdict gets refreshed before the human reviews.

### 7. Edit paths

`refresh-research` clears the stored verdict when it rewrites the value briefing
(so the card doesn't show a stale judgment) — the hash guard is the real
protection, this is belt-and-suspenders UX. `refresh-levels` already re-runs the
red-team on the new levels, so it is unchanged.

## Testing (TDD)

- `redTeamVerdictHash` — identical briefing → identical hash; a changed judged
  field (limitPrice, thesis, cashFlow, sleeve) → different hash; `null`/absent
  field normalization is stable.
- `isVerdictFresh` — fresh (matching hash, within TTL) → true; hash mismatch →
  false; past TTL → false; null `judgedAt`/`judgedHash` → false.
- `runRedTeam` stamps `judgedAt` + `judgedHash` (and on the fail-closed reject).
- `RED_TEAM_VERDICT_TTL_HOURS` pinned to 24.
- Approval: a stale stored verdict is re-run (asserted via a `runRedTeam` /
  `exec` spy); a fresh one is reused (no prosecutor call).
- Sweep: a proposal with a stale verdict is re-judged; a fresh one is skipped.
- Full suite + typecheck + lint stay green.

## Out of scope (follow-ups)

- Routine `Bash(curl:*)` narrowing and **C2** (parked).
- Remaining H/medium items and charter edits.
