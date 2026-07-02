# Design — Value-sleeve quality bars (quantified + dividend cut)

**Date:** 2026-07-02
**Branch:** `chore/charter-value-quality-bars`
**Source:** [Codebase Evaluation 2026-07-01](../../2026-07-01-codebase-evaluation.md) — Charter improvement #8.
**Series:** fifth charter/playbook sub-branch.

## Problem

The value-sleeve "Quality" checklist item is unquantified prose ("a profitable,
durable business with a sound balance sheet"), giving the red-team nothing
checkable. In fact most quality bars already exist in code
(`assessCashFlowQuality`: FCF negative / declining, D/E > `debtToEquityHeavy`,
coverage < `interestCoverageWeak`) and are briefed to the value lens — but they
are not stated in the playbook as the checkable minimum, and a **dividend cut**
is not flagged.

## Approach

### 1. Dividend-cut bar (code)

`assessDividendFloor` (`src/lib/dividend.ts`) flags an uncovered / stretched
dividend as at-risk. Add one more value-trap signal: a **negative
`dividendCagr`** — the dividend actually shrank over the measured window (a cut)
— pushes `status: "flag"`, `atRisk: true`, with a reason. `growthStreakYears == 0`
alone is not treated as a cut (flat ≠ cut); the signal is a real negative CAGR.

### 2. Playbook — enumerate the checkable minimum bars

`strategy/playbook.md`, value sleeve **Quality** item: replace the vague line
with the concrete, code-enforced bars, mirroring the thresholds:
- **FCF:** positive and non-declining (negative or declining FCF is a value-trap
  flag).
- **Leverage:** manageable — D/E ≤ `debtToEquityHeavy` (2) and interest coverage
  ≥ `interestCoverageWeak` (3×); suppressed for financial-sector names.
- **Dividend (if paid):** FCF-covered (≥ `fcfCoverageHealthy`, 1.2×), payout not
  stretched (≤ `payoutRatioStretched`, 100%), and **not recently cut** (CAGR ≥ 0).

Note that these are computed in code (`assessCashFlowQuality` /
`assessDividendFloor`) and surfaced to the value red-team — quality has teeth, it
is not the LLM's vibe. Change-log entry.

Thresholds stay the code constants (`CASH_FLOW_THRESHOLDS`,
`DIVIDEND_THRESHOLDS`), already tripwire-tested; the doc cites them by value.

## Testing (TDD)

- `assessDividendFloor`: a negative `dividendCagr` → `flag` / `atRisk` with a
  cut reason (new bar); a positive/absent CAGR with healthy coverage still
  `pass` (regression); a stretched-payout / thin-coverage case unchanged.
- Full suite + typecheck + lint stay green.

## Out of scope (later charter sub-branches)

Earnings-blackout N, discipline rules, charter doc-honesty pass.
