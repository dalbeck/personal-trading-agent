# Build Spec — FMP stable endpoints (403 fix) + reliable cash-flow sourcing

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/infra.md`, `src/lib/server/research/fmp.ts`, `src/lib/server/research/perplexity.ts`, `src/lib/server/symbol-research.ts` first. **Root-caused from diagnostics on a fresh VEEV analyze:** catalyst selection works now (got the Citi PT-raise, symbol-specific); the FMP fallback **fires** (key loaded) but returns **403 "Legacy Endpoint"** — the client uses FMP's deprecated `/api/v3/` routes, retired for new keys on 2025-08-31. Perplexity succeeded but only fetched quote + earnings categories (no cash-flow). So `cashFlow` is null because **both** sources missed it. Each milestone = its own branch + PR._

## M1 — `feature/fmp-stable-endpoints` (PRIORITY — the 403 fix)
Migrate the FMP client to the **stable API**:
- Change the base from the legacy `https://financialmodelingprep.com/api/v3/...` to **`https://financialmodelingprep.com/stable/...`** and update each path to its stable form. Verify exact paths against FMP's stable docs (`site.financialmodelingprep.com/developer/docs/stable`). Expected: `/stable/cash-flow-statement`, `/stable/income-statement`, `/stable/balance-sheet-statement`, `/stable/ratios` (or `/stable/key-metrics` for FCF yield / coverage), `/stable/dividends`, `/stable/profile`, `/stable/quote` — confirm param style (`?symbol=VEEV&apikey=…`).
- Map the stable responses through the existing `fmp-map` coercers (FCF, FCF yield, OCF, net debt, debt/equity, interest coverage; dividend yield, payout, fcfPayout, fcfCoverage, growth streak).
- **Acceptance:** an FMP call for a test symbol returns **200 with populated cash-flow + dividend** (no 403); diagnostics show `provider: fmp · outcome: ok`; a fresh analyze populates `cashFlow`/`dividend` from FMP, `cashFlowSource: fmp`. Unit-test the stable-endpoint client + map against a captured stable payload.

## M2 — `feature/fmp-primary-for-fundamentals` (make the reliable source primary)
Perplexity's structured cash-flow is **unreliable** (truncates, or doesn't fetch the cash-flow category, or returns prose without the JSON block — see VEEV). FMP is purpose-built, reliable, and cheap/free for structured statements. So:
- For **structured cash-flow / dividend / core fundamentals**, make **FMP the primary** source; keep **Perplexity for the narrative summary, catalysts, and analyst-consensus** color. Tag each field's source.
- Fallback chain for structured fundamentals becomes **FMP → Perplexity → unavailable** (was Perplexity → FMP). Perplexity still runs for narrative/catalysts.
- **Acceptance:** structured cash-flow/dividend come from FMP when available (tagged `fmp`); Perplexity still supplies the prose summary + catalysts; with FMP down, Perplexity's parsed values (if any) fill in; unit-tested for both source orders.

## M3 — `feature/perplexity-cashflow-extraction` (make Perplexity's path robust, as backup)
When Perplexity IS used for fundamentals, stop depending solely on the model echoing a JSON block:
- **Parse the structured `finance_results` blocks directly** (the `finance` array already cached) for the cash-flow / income / balance categories, not only the model's appended JSON.
- **Explicitly request** the cash-flow statement / FCF / dividend in the prompt so `finance_search` fetches those categories (VEEV only pulled quote + earnings).
- Treat "JSON block absent/partial" as a miss that **falls through to FMP** (per M2), and record the precise reason in diagnostics.
- **Acceptance:** a Perplexity result surfaces cash-flow from the finance_results blocks or the JSON; absence is detected and falls through; tested.

## After it lands
Clear the research cache and run a FRESH analyze — the current VEEV/LLY cache entries hold null-cashflow results and will keep serving them until busted.

## Live-probe findings (2026-06-28)

Probed the live stable API with the real key (VEEV + AAPL) before building, to verify paths and field names:

- **Paths + params confirmed.** Stable uses the **query-param** style under `https://financialmodelingprep.com/stable/`: `profile?symbol=…`, `quote?symbol=…`, `ratios-ttm?symbol=…`, `key-metrics-ttm?symbol=…`, `cash-flow-statement?symbol=…&period=annual&limit=N`, `balance-sheet-statement?…`, `income-statement?…`, `dividends?symbol=…`. Append `&apikey=…`.
- **Field renames vs v3 (must update the mapper):**
  - profile: `mktCap` → **`marketCap`**, `exchangeShortName` → **`exchange`** (e.g. "NASDAQ"); `companyName`/`ceo`/`sector`/`industry`/`country`/`fullTimeEmployees`/`ipoDate`/`website`/`description` unchanged.
  - ratios-ttm: `peRatioTTM` → **`priceToEarningsRatioTTM`**, `payoutRatioTTM` → **`dividendPayoutRatioTTM`**, `debtEquityRatioTTM` → **`debtToEquityRatioTTM`**, `interestCoverageTTM` → **`interestCoverageRatioTTM`**; `dividendYieldTTM` + `netIncomePerShareTTM` (EPS) unchanged and present here.
  - key-metrics-ttm: `marketCapTTM` → **`marketCap`**; `freeCashFlowYieldTTM` unchanged.
  - cash-flow-statement: `operatingCashFlow`/`freeCashFlow` unchanged; `dividendsPaid` is now null → use **`netDividendsPaid`** / `commonDividendsPaid`. Balance-sheet exposes **`netDebt`** directly (was left null in M2).
  - **dividends** returns a **flat array** `[{date,dividend,yield,frequency},…]`, NOT `{historical:[…]}` — the streak/CAGR mapper must accept both shapes.
- **⚠️ Free-tier symbol gate (new — the spec's root cause was incomplete).** The 403 "Legacy Endpoint" was real, but stable surfaces a **second** gate: this key's plan returns **HTTP 402 "not available under your current subscription"** on the statement/ratios/cash-flow/dividends endpoints for non-whitelisted symbols. Empirically: AAPL/MSFT/NVDA/GOOGL/AMZN/TSLA/PLTR → 200; **VEEV/CRM/LLY → 402** (profile + quote work for all). So **stable migration alone does NOT restore cash-flow for VEEV/LLY on the free plan** — the real fix for those symbols is either a **paid FMP plan** (removes the gate) or the **M3 Perplexity path**. M1 still ships (correct + fixes the megacap whitelist); the upgrade decision is raised at the M1 pause.

## Out of scope
- Gate/hard-rail/execution changes; Yahoo scraping; making the red-team numeric.
