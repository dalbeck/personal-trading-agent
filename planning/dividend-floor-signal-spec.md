# Build Spec — dividend sustainability as a recognized value floor

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `strategy/charter.md`, `strategy/playbook.md`, `.agents/infra.md`, `.agents/data-format.md`, `planning/value-sleeve-and-catalyst-spec.md`, `planning/value-cashflow-quality-spec.md` first. From a finance pro's review: the value red-team rejected a quality dividend-payer for "no floor/catalyst" even though its cash flow was strong — because the system never translated "FCF covers + can grow the dividend" into a **named floor**. This adds that. Value lens only. One feature branch + PR._

## Context (separate the two issues)
- Part of that JKHY rejection was the **stale entry** ($135 vs ~$128) — fixed separately in `fresh-levels-and-staged-entry` M1. **Re-evaluate red-team calibration only on FRESH levels.**
- The real gap here: the cash-flow data was present, but "Catalyst or floor — why now" showed **"Unspecified"**, so the red-team correctly rejected "no stated floor." The fix is to make **dividend sustainability** a recognized floor.

## Change — `feature/dividend-floor-signal`
- **Add dividend-sustainability signals** to the value lens (pull from the existing capped Perplexity value research — dividend + cash-flow data; no extra calls): dividend yield, **payout ratio** (and **FCF payout** = dividends ÷ FCF), **dividend coverage** (FCF ÷ dividends), and **dividend growth streak / CAGR**.
- **Register a real floor when coverage is durable.** When a dividend-payer has comfortable coverage (FCF clearly covers the dividend, healthy payout ratio, stable/growing dividend), **populate the "Catalyst or floor" with a concrete value** — e.g. `Dividend floor: FCF covers 2.4×, 14-yr growth streak` — instead of "Unspecified." Feed this stated floor into the **value red-team prompt** so it weighs a real floor (and stops rejecting purely for "no floor").
- **Contribute to value conviction** as part of / alongside the cash-flow-quality term (a strong, well-covered dividend lifts conviction; an uncovered/at-risk dividend does not and should drag, consistent with the cash-flow weighting).
- **Surface** a dividend block in the value breakdown (yield, payout ratio, FCF coverage, growth streak) with glossary tooltips.

## Honest guardrail (keep the discipline)
- A safe, growing dividend is a **floor** (downside protection / paid to wait) — **NOT automatically a why-now price catalyst.** Strong coverage should **satisfy the floor requirement** and move the verdict off "no floor → reject," but the value red-team may still reasonably weigh timing/why-now. **Do not let "safe dividend" alone force an approve** (a covered dividend can coexist with a multi-year price decline — a value trap that pays you to wait). The red-team stays a categorical judgment.
- An **uncovered or at-risk dividend** (FCF doesn't cover it, payout ratio stretched, cut risk) is a **value-trap red flag**, not a floor.

## Acceptance
- A quality dividend-payer with strong FCF coverage shows a **named dividend floor** (not "Unspecified"), and the value red-team recognizes it as a floor (no longer rejects purely for "no floor"); it contributes to value conviction.
- A name with an **uncovered/at-risk dividend** is still flagged (no false floor).
- Trend lens unchanged; the Perplexity cap is respected (fold into the one value fetch); dividend-metric parsing is a pure, unit-tested function; light + dark + a11y.

## Out of scope
- Trend-lens changes; making a safe dividend an auto-approve; gate/hard-rail changes; new data sources.
