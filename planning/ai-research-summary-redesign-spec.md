# Build Spec — redesign the AI research summary

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/design-system.md`, `.agents/nextjs.md`, `.agents/infra.md` first. One feature branch + PR. No real-money paths._

## Problem
The "AI research summary" renders the raw Perplexity `finance_search` output verbatim — long paragraphs plus the tool's own meta noise ("Quote field guide…", "Column legend…", "Data available in: RIVN_quotes_*.csv") and raw wide tables. It's a dense, uninteresting dump.

## Goal
Parse the structured `finance_search` response into typed sections and render purpose-built, scannable components. Strip all tool-artifact meta. Progressive disclosure: a tight summary by default, full detail behind an expander.

## Work — `feature/research-summary-redesign`
1. **Parse, don't dump.** In the research provider/normalizer, extract the structured `finance_results` categories (quote, profile, financials, earnings_history, transcript) into typed fields. **Strip** the LLM/tool scaffolding before it reaches the UI: "Quote field guide", "Column legend", "Data available in: …csv", row-key notes, and any internal CSV references. None of that renders.
2. **Redesigned card (default view):**
   - **Thesis** — 2–3 distilled sentences (trend + profitability + the key beat/miss + what the market's watching). Render via the safe markdown renderer.
   - **Key-metric chips** — Price (+ % change, gain/loss colored), Market cap, EPS (ttm), P/E (show "—/neg." when negative), Analyst stance. `tabular-nums`.
   - **Earnings surprises strip** — last ~4 quarters as compact cells: period, EPS actual, and a **beat/miss** marker (success/danger) with the post-earnings move. This is the visual centerpiece — the actual-vs-estimate data made glanceable, not a wide table.
   - **Catalysts** — short chip list.
   - **Identity line** — one compact row: sector · industry · CEO · employees · IPO.
3. **Progressive disclosure** — full financials / transcript / earnings table behind a "View full financials & transcript" expander, formatted cleanly (no field guides/legends); long tables scroll within their own container, never blow out the layout.
4. **Sourcing + honesty** — keep a small source note, but **normalize the display label to "Perplexity Finance"** — never render the raw tool name `finance_search` anywhere in the UI (e.g. "Perplexity Finance · capped · cached today"). Define the display name in one shared constant so every surface (this card, the symbol highlights, any source chips) uses it. Graceful states when the provider is off or a section is missing (show what's available, hide empty sections — no empty headers).
5. **Reuse** the same redesigned component on the symbol detail page's highlights section (M1 of the symbol spec) so research looks consistent everywhere.

## Acceptance
- No raw tool artifacts (field guides, legends, CSV refs) appear anywhere in the UI.
- The default card is scannable (thesis + chips + earnings strip + catalysts + identity); full detail is one expander away and doesn't overflow.
- Missing sections degrade gracefully; provider-off state is clear.
- Light + dark + a11y (earnings strip has a text equivalent; expander is keyboard-accessible).
- Unit-test the parser: given a `finance_search` response, it produces typed sections with the scaffolding stripped.

## Out of scope
- Changing how research is produced (presentation/parsing only); real-money paths.
