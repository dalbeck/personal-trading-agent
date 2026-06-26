# Build Spec — cash-flow quality in the value lens (floor vs. value-trap)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `strategy/charter.md`, `strategy/playbook.md`, `.agents/data-format.md`, `.agents/infra.md`, and `planning/value-sleeve-and-catalyst-spec.md` first. From a finance pro's review of a JKHY proposal: for a value/mean-reversion call, **cash flow is the key discriminator** between "hitting a floor with upside" and a value trap — and the value lens doesn't surface or judge it yet. One feature branch + PR. Value lens only; trend lens unchanged._

## Change — `feature/value-cashflow-quality`
Add **cash-flow quality** as a first-class signal in the value/mean-reversion lens:
- **Fetch** (via the existing Perplexity `finance_search` value research — pull these fields in the SAME capped request, no extra calls): operating cash flow, **free cash flow** (level + recent trend), **FCF yield** (FCF ÷ market cap), and leverage/coverage (net debt, debt-to-equity, interest coverage) from the cash-flow + balance-sheet data.
- **Value checklist item** — "Cash-flow quality": passes ✓ when FCF is **positive and stable/growing** with a healthy FCF yield and manageable leverage; **flags** ⚑ when FCF is negative/declining or leverage is rising. (This is the "is it a floor, or a trap" test.)
- **Value red-team weighs it.** Its value-trap detection should treat **strong/stable FCF as support for the floor thesis** and **deteriorating/negative FCF + rising leverage as a strong value-trap red flag** — alongside the existing fundamental-deterioration checks.
- **Surface it** in the value breakdown on the proposal/detail page: a small cash-flow stat block (FCF, FCF yield, OCF trend, net debt/leverage), within the design system.
- **Honest framing:** good cash flow doesn't make a value play a buy, but its **absence is a strong disqualifier**. Present it as evidence for the human + red-team to weigh, not a verdict. Glossary tooltips on FCF / FCF yield / coverage.
- **Scope:** value lens only (trend lens untouched); respects the Perplexity daily cap (fold the cash-flow fields into the one existing value research fetch); hard rails + gates unchanged.
- **Acceptance:** value proposals show cash-flow quality metrics + the checklist item; the value red-team references cash flow in its floor-vs-trap reasoning; trend proposals unchanged; the Perplexity cap is respected (no extra calls); cash-flow parsing is a pure, unit-tested function; light + dark + a11y.

## Out of scope
- Trend-lens changes; execution/gate/hard-rail changes; new data sources (reuse Perplexity); options/crypto/margin.
