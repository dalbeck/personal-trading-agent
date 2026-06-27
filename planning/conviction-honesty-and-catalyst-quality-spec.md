# Build Spec — conviction honesty + catalyst/data quality

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `strategy/charter.md`, `strategy/playbook.md`, `.agents/infra.md`, `.agents/data-format.md`, `planning/value-cashflow-quality-spec.md`, `planning/value-sleeve-and-catalyst-spec.md` first. From a JKHY export: `convictionScore 0.89 (high)` while BOTH red-teams reject AND cash-flow quality was unknown — the score rewarded "cheap + big R:R" and ignored the missing quality data; the "catalyst" was a truncated business description that still passed the checklist. Each milestone = its own branch + PR._

## M1 — `feature/conviction-honesty`
The conviction score must not read "high" when the evidence is absent or the verdict is reject:
- **Penalize/cap on missing key inputs.** If a value proposal's **cash-flow / quality data is unknown** (or other key signals are missing), conviction is **dragged down and capped** (e.g. cannot be "high") — unknown is a penalty, not neutral. A value play with unknown cash flow is not high-conviction.
- **Conviction is a ranking signal, not a verdict — make the UI say so.** The **red-team verdict is the headline**; the conviction tier/score is secondary and clearly labelled (ranking/sort signal). When the verdict is **reject**, do not present conviction as reassuring — surface the tension (e.g. "high signal · red-team reject") rather than a bare green "high". Consider capping the displayed tier when the matching red-team rejects.
- Keep the cash-flow weighting from `value-cashflow-quality-spec` (cash-flow can subtract); this milestone adds the **unknown-data penalty** + the verdict-aware display.
- **Acceptance:** a value proposal with unknown cash-flow can't be "high conviction"; missing key inputs measurably lower the score; the UI subordinates conviction to the verdict and shows the conflict when red-team rejects; the score function (incl. the unknown-data penalty) is pure + unit-tested.

## M2 — `feature/catalyst-extraction-quality`
A real catalyst, or it flags — never a business description:
- **Stop auto-filling the catalyst with boilerplate research/company-description text.** A catalyst must be a specific why-now (earnings move, guidance, dividend action, insider/analyst floor, oversold/support trigger). A **business description or generic blurb → `catalyst_type: none/other` → flags ⚑** (not ✓), aligning with the catalyst-tightening intent.
- **Fix text truncation** — the thesis/research/catalyst fields are cut mid-word (e.g. "Information Te"). Truncate on word/sentence boundaries with an ellipsis, or keep the full text behind the read-more.
- **Acceptance:** a description-as-catalyst flags (does not pass the checklist); a named catalyst passes; no mid-word truncation anywhere it's displayed/exported; tested.

## M3 — `feature/research-unavailable-state`
When Perplexity / cash-flow data is unavailable (off / capped / failed), say so:
- Mark the affected fields **"data unavailable"** explicitly (not a blank or a silent `—`), surfaced on the proposal + export, and have it **feed the conviction penalty (M1)** and the red-team's awareness ("quality unverified").
- **Acceptance:** an unavailable research/cash-flow fetch renders a clear "unavailable" state (not silent), drags conviction, and is reflected in the export; tested.

## Out of scope
- Gate/hard-rail/execution changes; making the red-team numeric; new data sources.
