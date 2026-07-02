# Design — Harden the live approval path (concern size + hard caps)

**Date:** 2026-07-02
**Branch:** `fix/live-approval-enforcement`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — Medium items: "Concern verdict unenforced on the live path" + "One override comment bypasses everything".
**Series:** first of the self-contained medium/low code fixes (after the charter roadmap).

## Problems

1. **Concern not enforced on the live path.** The rules say `concern` = reduced
   size, and the paper batch halves qty (`execute.ts`), but `submitTradeApproval`
   places a concern-rated order at **full size**.
2. **Hard live caps are overridable.** `submitTradeApproval` blocks live caps only
   `&& !override` — so one justification comment clears `live-max-exposure` and
   `live-funded-cap`, the account's hard money guardrails.

## Approach (both in `src/lib/server/live-order.ts` `submitTradeApproval`)

### 1. Concern → half size, tagged
After the blocks clear, if `blocks.redTeam?.verdict === "concern"`, route + journal
**half** the qty (`order.qty / 2`, fractional-safe — the live desk allows fractional
shares). Halving is strictly more conservative than the rails/caps already
evaluated on the full qty, so no re-check is needed. The placed + journaled `qty`
is the halved value (today the journal writes `order.qty` — that must become the
placed qty), tagged `concern:half-size`, and the result carries `downsized: true`.

### 2. Hard live caps, non-overridable
Change the caps guard from `if (capViolations.length > 0 && !override)` to
`if (capViolations.length > 0)` — `live-max-exposure` / `live-funded-cap` now block
regardless of a comment (like stale-levels). Remove the now-dead cap branch in the
override audit trail. Red-team rejects and risk-rail violations stay overridable
(unchanged).

## Testing (TDD)

- A `concern` live order routes + journals **half** the qty, tagged
  `concern:half-size`, `downsized: true`; an `approve` order is full size,
  unchanged.
- A live-cap violation returns `blocked-caps` **even with** a valid override
  (previously cleared); a rail / red-team violation is still cleared by a valid
  override (regression).
- Full suite + typecheck + lint stay green (a test that asserted a cap override
  succeeded is inverted).

## Out of scope

Order-counter race, `nowET()` UTC, symbol `.`/`..`, and the other medium/low
items (their own branches).
