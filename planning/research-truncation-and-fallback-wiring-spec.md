# Build Spec — fix research truncation + harden the FMP fallback

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/infra.md`, `src/lib/server/research/perplexity.ts`, `src/lib/server/research/index.ts`, and the proposal builder first. **Root-caused from the cache + diagnostics:** Perplexity calls SUCCEED (diagnostics `outcome: ok`, ~12s, billed), but `max_output_tokens: 512` **truncates the JSON before cashFlow/dividend** (the cached LLY response cuts off at `"cons`…, i.e. start of consensus — earnings/catalysts/cashFlow/dividend never emitted). The truncated, present-but-unparseable JSON is silently recorded as `outcome: ok` and cached as a clean success with `cashFlow: null`. Each milestone = its own branch + PR._

> **Correction (post-investigation, supersedes the original M2 framing).** The original draft of this spec asserted that "`getFundamentalsFallbackProvider` (FMP) is not called by the proposal builder." **That is stale** — PR #155 (`fundamentals-fallback-fmp`) already wired FMP into the research path: `getSymbolResearch` (`src/lib/server/symbol-research.ts`) calls FMP when `needFmp` is true, `analyzeSymbol → defaultResearch` consumes it, and the merge / source-tagging (`cashFlowSource` / `dividendSource`) / `researchStatus: "ok"` logic all exist. The reasons LLY's `cashFlow` is still null are: **(a)** FMP never fired (no `fmp` entry in `data/research/diagnostics.json` → FMP is **off**, no `FMP_API_KEY` set — a human-only secret action), and **(b)** the `needFmp` guard requires Perplexity's `fundamentals` to *also* be null, so a partially-parsed / truncated result may not trigger it. **M2 is therefore re-scoped to _hardening the existing trigger_, not wiring a new one.**

## M1 — `feature/research-output-completes` (THE cash-flow fix)
The structured JSON must complete through `cashFlow` + `dividend`:
- **Raise `max_output_tokens`** from 512 to a generous value (~3500–4000) so the prose + the full JSON (profile → fundamentals → consensus → earnings → catalysts → cashFlow → dividend) fits.
- **Guarantee the structured block survives truncation** — emit the **JSON first** (before any prose) OR request **structured-JSON-only** (drop/shorten the prose), so the critical cashFlow/dividend can never be the part that gets cut. Prefer JSON-first/JSON-only.
- **Detect truncation:** if the JSON block is missing/unparseable (e.g. unterminated), log it as `truncated`/`parse-error` in diagnostics and **trigger the FMP fallback (M2)** rather than returning null cash-flow.
- **Bust the cache:** clear the existing cached entries (they hold truncated null-cashFlow results) so a fresh fetch runs; ensure a result with `cashFlow: null` due to truncation is NOT cached as a clean success.
- **Acceptance:** a fresh analyze of a large-cap (e.g. LLY) returns **complete cashFlow + dividend** from Perplexity (JSON parses fully, not truncated); the diagnostics show the parse succeeded; unit-test that the full schema parses and that a truncated body is detected.

## M2 — `feature/harden-research-fallback` (harden the fallback that already exists)
`getFundamentalsFallbackProvider` (FMP) **is already wired** into `getSymbolResearch` (PR #155). M2 hardens the **trigger** so a truncated/partial Perplexity result reliably falls through to FMP, rather than wiring a new path:
- **Trigger on truncation/partial, not just all-null.** Today `needFmp = !pplx?.cashFlow && !pplx?.dividend && !pplx?.fundamentals` — it only fires when Perplexity supplied *no* value data at all. Loosen it so a result that is **missing cashFlow/dividend OR flagged truncated by M1** triggers FMP even when Perplexity did parse some fundamentals. The value-lens cash-flow path is what matters: when `cashFlow`/`dividend` come back null/unavailable/truncated/capped, **FMP fills them** and the source is tagged `cashFlowSource` / `dividendSource` (perplexity | fmp).
- **Confirm FMP's cash-flow + dividend mapping** is correct (FCF, FCF yield, leverage, payout, coverage) via the existing `fmp-map` coercers.
- **Config action (human-only):** FMP only fires when `FMP_API_KEY` is set in `.env`. The agent cannot set secrets — the owner must add the key for the fallback to actually spend. With no key, behaviour is unchanged (FMP off) and the chain ends at "unavailable".
- **Acceptance:** with Perplexity cashFlow null/truncated, FMP populates cash-flow + dividend in the proposal (no longer "data unavailable"); the source is tagged FMP; unit-tested (perplexity-null → FMP-up, and perplexity-truncated → FMP-up).

## M3 — `feature/proposal-refresh-rebuilds`
A stored proposal is a frozen snapshot — make refresh actually rebuild it (or stop it misleading the user):
- **"Refresh research" on a proposal must re-derive** the value-lens fields (cashFlow, dividend, catalyst, conviction, red-team) from fresh research — not just update the cache while leaving the proposal's stored fields stale.
- Show the proposal's **research timestamp** and a clear "refresh re-runs the analysis" affordance; a manual analyze always produces a NEW proposal id with current data.
- **Acceptance:** refreshing a proposal re-derives cash-flow/catalyst/conviction from current research; the user can't be shown a pre-fix snapshot without a clear "stale — refresh" indication; tested.

## Verify (already specced earlier — confirm it's actually applied on a fresh run)
- **Catalyst selection** (`research-reliability` M3): the Apogee "stocks moving higher" roundup must NOT be picked as LLY's catalyst on a fresh analyze — confirm symbol-specific/material selection is in effect.

## Out of scope
- Gate/hard-rail/execution changes; Yahoo scraping; making the red-team numeric.
