# Build Spec — research reliability (observability), fundamentals fallback, catalyst selection

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/infra.md`, `.agents/data-format.md`, `src/lib/server/research/perplexity.ts` first. From repeated LLY proposals: Perplexity cash-flow fetch keeps failing, but `perplexity.ts` returns `null` SILENTLY on every failure path (no key / HTTP error / timeout / cap) so the cause is invisible; and catalyst SELECTION picked a junk roundup ("Apogee… stocks moving higher") over the material LLY headlines. Each milestone = its own branch + PR._

## CHECK FIRST (operational — not code)
Likely root cause of the failing fetch (verify before/while building): the **Perplexity Agent API is pay-as-you-go, separate from Pro** — confirm `PERPLEXITY_API_KEY` is set, `RESEARCH_PROVIDER=perplexity`, and the **Perplexity API account has billing + credits**. M1 will make the actual reason visible.

## M1 — `feature/research-observability` (priority — can't fix a silent failure)
Make every research failure **legible**:
- In `perplexity.ts` (and the provider layer), capture + log the **specific failure reason** instead of a bare `null`: `no-api-key`, `provider-off`, `daily-cap-reached`, `http-<status>` (log the status + a short body snippet), `timeout`, `parse-error`, `network-error`.
- **Surface the specific reason** on the proposal (and export): e.g. "research unavailable — HTTP 402 (check API billing)" / "timeout" / "no API key" — not a generic "research fetch failed."
- **Raise the timeout** for the agent `finance_search` call (15s → ~35s; structured agent calls are slow).
- Add a small **diagnostics surface** (last research call: status, reason, latency, cost) visible in Operations/Logs so you can see provider health.
- **Acceptance:** a forced failure (bad key / non-200 / timeout) is logged with its specific cause and shown in the UI with that reason; the timeout is raised; the diagnostics surface shows the last call's outcome; tested per failure mode.

## M2 — `feature/fundamentals-fallback-fmp`
Add a dedicated **fundamentals provider as a fallback** for cash-flow/fundamentals when Perplexity is unavailable (Alpaca = prices/news, Robinhood = account — neither supplies fundamentals, so a dedicated API is required):
- Recommend **Financial Modeling Prep (FMP)** — free tier; clean income/balance/**cash-flow**/ratios/**dividend** endpoints; it's the same source Perplexity uses underneath. Behind the existing `ResearchProvider` interface; keyed; default-off unless configured.
- **Fallback chain:** Perplexity (when configured + healthy) → FMP → unavailable. Tag which provider supplied each field so it's verifiable. Respect each provider's limits.
- **Acceptance:** with Perplexity unavailable but FMP configured, cash-flow/fundamentals populate from FMP (no longer "data unavailable"); the provider is tagged; the fallback is unit-tested (mock both providers, incl. Perplexity-down → FMP-up).

## M3 — `feature/catalyst-selection-quality`
Pick the right catalyst, not the first headline:
- **Prefer headlines where the SYMBOL is the primary subject** — filter out multi-ticker roundups / "stocks moving higher" listicles that merely mention the symbol.
- **Rank by materiality:** regulatory/FDA/EMA approvals, M&A, guidance, major analyst actions, clinical/product news > generic movers roundups.
- **Synthesize** the catalyst from the top relevant headlines (LLM), and set `catalyst_type` from the **actual event** — never from a co-listed company's news (the bug labeled LLY "Earnings momentum" off Apogee's earnings).
- **Acceptance:** for a catalyst-rich symbol the selected catalyst is the material, symbol-specific one (e.g. the EMA approval / Medicare program for LLY), not a roundup; roundup/listicle headlines are filtered from selection (they may still appear as sources); `catalyst_type` matches the actual event; tested with a mixed headline set incl. a roundup.

## Out of scope
- Gate/hard-rail/execution changes; Yahoo scraping; making the red-team numeric.
