# Fundamentals Fallback — FMP (M2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add **Financial Modeling Prep (FMP)** as a dedicated fundamentals provider behind the existing `ResearchProvider` interface, and wire a **fallback chain — Perplexity (when configured + healthy) → FMP → unavailable** — so cash-flow / fundamentals / dividend data populate from FMP when Perplexity is down, tagged by which provider supplied each field.

**Architecture:** A pure mapping module (`fmp-map.ts`) converts FMP's v3 JSON into the existing `ResearchFundamentals` / `ResearchProfile` / `CashFlowQuality` / `DividendSignals` shapes using the existing `parse.ts` coercers. A keyed, default-off, capped `createFmpProvider` (mirrors `createPerplexityProvider`) calls a bounded set of FMP v3 endpoints, emits the same `ResearchDiagnostic` (provider `"fmp"`) to the shared ring, and returns a `ResearchResult`. `getSymbolResearch` calls FMP **only when Perplexity did not supply the value-quality data** (conserving FMP's cap), merges field-by-field with per-field source tags, and the proposal's `researchStatus` reads **"ok" whenever the value-quality data is present from any healthy provider** (so FMP-filled data is no longer "data unavailable").

**Tech Stack:** Next.js 16 (RSC), TypeScript, Zod, Vitest, Tailwind. Node 22 / pnpm 11.

## Global Constraints

- **Node 22.x / pnpm 11.9.0.**
- **No AI attribution** in commits/PRs/branches (AGENTS.md hard rules 1–2). Branch: `feature/fundamentals-fallback-fmp`.
- **Feature branch → PR → merge** (hard rule 3). **Never commit secrets** (hard rule 4) — `FMP_API_KEY` lives in `.env` only.
- **Research is context-only** — FMP supplies fundamentals/cash-flow/dividend/profile for CONTEXT; **never order pricing or execution** (Alpaca stays price-of-record). This milestone must not change gates, risk rails, the red-team's numeric behavior, or execution.
- **Default-off:** with no `FMP_API_KEY`, FMP is never called and behavior is identical to today.
- **Respect provider limits:** FMP free tier is ~250 API calls/day. Each FMP research invocation issues several HTTP requests; the daily cap counts **invocations** (shared in-code counter, like Perplexity) and defaults conservatively.
- **Live-verification caveat:** FMP's docs were inaccessible during planning (403) and no key was available. The field mapping targets FMP's **v3 API** (`https://financialmodelingprep.com/api/v3`, auth via `?apikey=`). Code defensively (every field via the `parse.ts` coercers; a missing/renamed field → `null`, never a crash). The PR must flag that the live mapping needs verification against a real key before `FMP_API_KEY` is set in production.
- **Test command:** `pnpm vitest run <file>`; full suite `pnpm test`; `pnpm typecheck`; `pnpm lint`. Path alias `@/` → `src/`. Tests inject a temp `dataDir` and a mock `fetchImpl` — never hit the network or write to real `data/`.
- **Self-correction mandate:** update `.agents/infra.md` (+ `.agents/data-format.md` / `.env.example`) in the same change.

---

## FMP v3 endpoint & field map (the source of truth for Task 1 + Task 2)

Base URL: `process.env.FMP_API_URL ?? "https://financialmodelingprep.com/api/v3"`. Auth: append `?apikey=<KEY>` (FMP uses an `apikey` query param, **not** a bearer header). Each endpoint returns a JSON **array** (1 element for `*-ttm`/`profile`; multiple rows for statements). All field reads go through `parse.ts` coercers so renamed/missing fields degrade to `null`.

| Endpoint (GET, append `?apikey=`) | FMP fields used | Maps to |
|---|---|---|
| `/profile/{symbol}` | `mktCap`, `companyName`, `website`, `ceo`, `sector`, `industry`, `country`, `exchangeShortName`, `ipoDate`, `fullTimeEmployees`, `description` | `ResearchProfile.*`; `ResearchFundamentals.marketCap` (← `mktCap`) |
| `/ratios-ttm/{symbol}` | `peRatioTTM`, `dividendYieldTTM`, `payoutRatioTTM`, `debtEquityRatioTTM`, `interestCoverageTTM` | `fundamentals.peRatio`; `fundamentals.dividendYield` & `dividend.dividendYield` (FMP gives a fraction); `dividend.payoutRatio`; `cashFlow.debtToEquity`; `cashFlow.interestCoverage` |
| `/key-metrics-ttm/{symbol}` | `marketCapTTM`, `freeCashFlowYieldTTM`, `netIncomePerShareTTM`, `enterpriseValueTTM` | `fundamentals.marketCap` (fallback); `cashFlow.fcfYield`; `fundamentals.eps` (← `netIncomePerShareTTM`) |
| `/cash-flow-statement/{symbol}?period=annual&limit=5` | rows newest-first: `[0].operatingCashFlow`, `[0].freeCashFlow`, `[0].dividendsPaid`; `freeCashFlow` across rows | `cashFlow.operatingCashFlow`, `cashFlow.freeCashFlow`, `cashFlow.fcfTrend` (compare years), `dividend.fcfPayout`/`fcfCoverage` (← `abs(dividendsPaid) / freeCashFlow`) |
| `/historical-price-full/stock_dividend/{symbol}` | `historical: [{ date, dividend }]` | `dividend.growthStreakYears`, `dividend.dividendCagr` (aggregate by calendar year) |

`cashFlow.netDebt` is left `null` for M2 (absolute net debt needs an extra balance-sheet call; it is nullable/best-effort). Note this in the mapper doc-comment.

**fcfTrend rule:** with annual `freeCashFlow` rows newest-first `f[0..n]`, compare the latest to the prior year: `f[0] > f[1] * 1.05 → "growing"`, `f[0] < f[1] * 0.95 → "declining"`, else `"stable"`. Need ≥2 finite years, else `null`.

**dividend year-aggregation:** sum `dividend` amounts by `date` calendar year (descending), drop the current partial year if it has fewer payments than the prior full year. `growthStreakYears` = count of consecutive most-recent **full** years where annual total ≥ the next-older year's total. `dividendCagr` over up to 5 full years: `(latestFull / oldestFull) ** (1 / yearsSpan) - 1`, `null` if `< 2` full years or non-positive endpoints.

---

## File Structure

**Create:**
- `src/lib/server/research/fmp-map.ts` — pure mappers (raw FMP JSON → the four shapes). Server-agnostic, no `server-only`, no fetch — pure functions so they unit-test without network.
- `src/lib/server/research/fmp-map.test.ts`
- `src/lib/server/research/fmp.ts` — `createFmpProvider(opts?: FmpOpts): ResearchProvider`. Server-only.
- `src/lib/server/research/fmp.test.ts`

**Modify:**
- `src/lib/server/research/index.ts` — extend `ResearchProviderName` with `"fmp"`; `getResearchProvider` returns FMP when selected; add `getFundamentalsFallbackProvider()`.
- `src/lib/server/research/types.ts` — `ResearchOrigin` += `"fmp"`; `SymbolResearch` gains `cashFlowSource` + `dividendSource: ResearchOrigin`.
- `src/lib/server/symbol-research.ts` — `mergeSymbolResearch` gains `fmp` arg + source tagging; `getSymbolResearch` conditional FMP fallback fetch.
- `src/lib/server/research/cache.ts` — bump `CACHE_VERSION` 8→9.
- `src/lib/server/analyze-symbol.ts` — `researchStatus` reflects value-quality data presence (FMP-aware), and tag the source.
- `src/components/symbol/*` + `src/components/logs/research-health-panel.tsx` — source labels include FMP; health line shows the provider.
- `.env.example`, `.agents/infra.md`, `.agents/data-format.md` (if it lists providers).

---

### Task 1: FMP response → shape mappers (pure)

**Files:** Create `src/lib/server/research/fmp-map.ts`, `src/lib/server/research/fmp-map.test.ts`.

**Interfaces:**
- Consumes: `coerceMoneyLike`, `coerceNumberLike`, `coercePercentLike`, `coerceIntLike` from `./parse`; types `ResearchFundamentals`, `ResearchProfile` from `./types`; `CashFlowQuality`, `DividendSignals` from `@/lib/types`.
- Produces a single entry point: `mapFmpToResearch(raw: FmpRaw): { fundamentals, profile, cashFlow, dividend }` where each is the shape-or-`null`, and `FmpRaw = { profile?: unknown; ratiosTtm?: unknown; keyMetricsTtm?: unknown; cashFlow?: unknown; dividendHistory?: unknown }` (each is the parsed JSON body of that endpoint — array or object as FMP returns it). Also export the small helpers `fcfTrendFromRows(rows)`, `dividendStreakAndCagr(historical)` so they can be unit-tested directly.

- [ ] **Step 1: Write failing tests** — cover, with representative FMP-shaped fixtures (arrays):
  - `mapFmpToResearch` maps a full set: `mktCap`→marketCap, `peRatioTTM`→peRatio, `netIncomePerShareTTM`→eps, `dividendYieldTTM`(fraction)→fundamentals.dividendYield & dividend.dividendYield, `payoutRatioTTM`→dividend.payoutRatio, `debtEquityRatioTTM`→cashFlow.debtToEquity, `interestCoverageTTM`→cashFlow.interestCoverage, `freeCashFlowYieldTTM`→cashFlow.fcfYield, cash-flow `operatingCashFlow`/`freeCashFlow`→cashFlow, `abs(dividendsPaid)/freeCashFlow`→dividend.fcfPayout with `fcfCoverage` derived.
  - `fcfTrendFromRows`: growing / declining / stable / null(<2 years), using the ±5% rule.
  - `dividendStreakAndCagr`: a clean 5-year rising history → streak ≥4 and a positive CAGR; an empty/1-entry history → `{ growthStreakYears: null, dividendCagr: null }`.
  - All-empty input → all four groups `null` (never throws).
  - Profile maps `website`→`domain` as the host only (reuse the same host-extraction the Perplexity profile uses if one exists in `parse.ts`; else strip protocol/path).
- [ ] **Step 2: Run → RED.**
- [ ] **Step 3: Implement** the mappers. Every numeric read goes through a coercer (`coerceMoneyLike` for money, `coercePercentLike` for FMP fractions that may arrive as 0.0044 — NOTE: FMP TTM yields/ratios are already fractions, so use `coerceNumberLike` for those, NOT `coercePercentLike`, which divides by 100; verify each field's unit and pick the coercer that yields the documented fraction). `growthStreakYears` via `coerceIntLike`. Guard every array access (`Array.isArray(...) ? x[0] : null`). A group with no usable field → `null` (mirror `coerceCashFlow`/`coerceDividend`'s `hasAny` pattern).
- [ ] **Step 4: Run → GREEN; `pnpm typecheck`.**
- [ ] **Step 5: Commit** `git commit -m "Add FMP fundamentals response mappers"`.

> **Unit note for the implementer:** double-check FMP units. `dividendYieldTTM`, `payoutRatioTTM`, `freeCashFlowYieldTTM` are **fractions** in FMP v3 (e.g. 0.0044) → use `coerceNumberLike` (no /100). `peRatioTTM`, `debtEquityRatioTTM`, `interestCoverageTTM`, `netIncomePerShareTTM` are plain numbers → `coerceNumberLike`. `mktCap`, `operatingCashFlow`, `freeCashFlow`, `dividendsPaid` are raw dollars → `coerceMoneyLike`.

---

### Task 2: `createFmpProvider`

**Files:** Create `src/lib/server/research/fmp.ts`, `src/lib/server/research/fmp.test.ts`.

**Interfaces:**
- Consumes: `mapFmpToResearch` (Task 1); `recordResearchDiagnostic` + `ResearchDiagnostic`/`ResearchOutcome` from `./diagnostics`; `getResearchCallCount`/`bumpResearchCallCount` from `./usage`; `ResearchProvider`/`ResearchResult` from `./types`.
- Produces: `export interface FmpOpts { apiKey?; apiUrl?; dailyCap?; dataDir?; fetchImpl?; now? }` and `export function createFmpProvider(opts?: FmpOpts): ResearchProvider`.

Behavior (mirror `createPerplexityProvider`, see `perplexity.ts`):
- Reads `opts.apiKey ?? process.env.FMP_API_KEY ?? ""`, `opts.apiUrl ?? process.env.FMP_API_URL ?? "https://financialmodelingprep.com/api/v3"`, `opts.dailyCap ?? Number(process.env.FMP_DAILY_CALL_CAP ?? "40")`, clock `opts.now ?? () => new Date()`, `doFetch = opts.fetchImpl ?? fetch`.
- `name: "fmp"`. Exposes `lastDiagnostic()` (closure `last`), emits the diagnostic on every path with `provider: "fmp"`, persists to the ring, logs non-ok via `console.warn`.
- `research({symbol})`:
  - no key → diagnostic `no-api-key`, return `null`.
  - cap check via shared `getResearchCallCount(date)` ≥ cap → `daily-cap-reached`, return `null`.
  - Fetch the **5 endpoints in parallel** (`Promise.allSettled`), each `GET ${apiUrl}/<path>/${symbol}?apikey=${key}` with `AbortSignal.timeout(20_000)`. A network throw across **all** → `timeout` (if `TimeoutError`/`AbortError`) else `network-error`. If the **profile or ratios** call returns a non-200 (auth/limit signal, e.g. 401/403/429) and no endpoint produced data → `http-error` with that status + a ≤200-char body snippet.
  - Parse each settled JSON body, hand the bundle to `mapFmpToResearch`. If every group is `null` → `parse-error`, return `null` (no data obtained).
  - Else build a `ResearchResult` (`provider: "fmp"`, `summary: ""`, `finance: []`, `sources: []`, `categories: []`, `tickers: [symbol]`, populated `fundamentals`/`profile`/`cashFlow`/`dividend`, `consensus: null`, `earnings: []`, `catalysts: []`, `usedAt: clock().toISOString()`), `bumpResearchCallCount(date)` (one invocation), emit `ok`, return it.
- [ ] **Step 1: Write failing tests** (mock `fetchImpl` returning per-URL fixtures keyed by path substring): ok path populates cashFlow+fundamentals+dividend and records `ok`; missing key → `no-api-key`+null; a 401 on all → `http-error`/401; a timeout throw → `timeout`; cap reached → `daily-cap-reached`; all-empty bodies → `parse-error`+null. Assert `bumpResearchCallCount` increments only on ok (read back via `getResearchCallCount`), and a diagnostic lands in the ring with `provider: "fmp"`.
- [ ] **Step 2: RED. Step 3: Implement. Step 4: GREEN + typecheck + `pnpm test`.**
- [ ] **Step 5: Commit** `git commit -m "Add the FMP fundamentals research provider"`.

---

### Task 3: Provider factory + env wiring

**Files:** Modify `src/lib/server/research/index.ts`; `.env.example`.

- [ ] Extend `ResearchProviderName` to `"off" | "perplexity" | "fmp"`. In `getResearchProvider`, `if (which === "fmp") return createFmpProvider(opts as FmpOpts)`. Add `export function getFundamentalsFallbackProvider(opts?: FmpOpts): ResearchProvider` returning `createFmpProvider(opts)` when `process.env.FMP_API_KEY` (or `opts.apiKey`) is set, else `offProvider`. Export `createFmpProvider`/`FmpOpts` types as needed.
- [ ] `.env.example`: add an FMP block mirroring the Perplexity one (`FMP_API_KEY=`, `FMP_DAILY_CALL_CAP=40`, commented `# FMP_API_URL=https://financialmodelingprep.com/api/v3`) with a one-line note: free-tier fundamentals fallback, research-only, default-off, each invocation issues several FMP requests.
- [ ] **Tests:** a small `index`/factory test (or extend an existing one) asserting `getResearchProvider({provider:"fmp", apiKey:"k"}).name === "fmp"`, and `getFundamentalsFallbackProvider()` returns `off` when no key, `fmp` when keyed. Typecheck. Commit `git commit -m "Wire the FMP provider into the research factory and env"`.

---

### Task 4: Orchestrator fallback chain + per-field source tags

**Files:** Modify `src/lib/server/research/types.ts`, `src/lib/server/symbol-research.ts`, `src/lib/server/research/cache.ts`.

**Interfaces:**
- `ResearchOrigin = "robinhood" | "perplexity" | "fmp" | null`.
- `SymbolResearch` gains `cashFlowSource: ResearchOrigin;` and `dividendSource: ResearchOrigin;` (after `dividend`). Bump `CACHE_VERSION` 8→9 with a comment.
- `mergeSymbolResearch` args gain `fmp: ResearchResult | null`.

Merge rules (Perplexity preferred, FMP fills the gap; Robinhood still preferred for fundamentals/profile):
- `fundamentals`: each field `rf?.x ?? pf?.x ?? ff?.x`. `fundamentalsSource = rf-has-any ? "robinhood" : pf-has-any ? "perplexity" : ff-has-any ? "fmp" : null` (tag by the source that supplied the **first non-null** of the group — keep it simple: Robinhood if it has any field, else Perplexity if any, else FMP if any).
- `profile`: `rp?.x ?? pp?.x ?? fp?.x`; `profileSource` analogous.
- `cashFlow = perplexity?.cashFlow ?? fmp?.cashFlow ?? null`; `cashFlowSource = perplexity?.cashFlow ? "perplexity" : fmp?.cashFlow ? "fmp" : null`.
- `dividend = perplexity?.dividend ?? fmp?.dividend ?? null`; `dividendSource` analogous.
- `consensus`, `summary`, `earnings`, `catalysts`, `finance`, `sections`, `categories`, `sources`, `usedAt`, `cost` stay Perplexity-only (FMP supplies none).

`getSymbolResearch` — conditional FMP fetch (conserve the cap):
- After the existing RH + Perplexity `Promise.all` and the `perplexityStatus` derivation, decide `needFmp = perplexity-did-not-supply-value-data` → `!pplx?.cashFlow && !pplx?.dividend && !pplx?.fundamentals`. (So a healthy Perplexity call never spends an FMP call.)
- Resolve `const fmpProvider = opts?.fmpProvider ?? getFundamentalsFallbackProvider();` (add `fmpProvider?: ResearchProvider` to `GetSymbolResearchOpts` for tests). `const fmpOn = fmpProvider.name !== "off";`
- `const fmp = needFmp && fmpOn ? await Promise.resolve(fmpProvider.research({ symbol })).catch(() => null) : null;`
- Pass `fmp` into `mergeSymbolResearch`. The FMP diagnostic (if any) already lands in the ring for the Logs panel.
- The `hasData` cache-write guard already includes cashFlow? It checks `fundamentals || profile || consensus || summary` — extend it to also keep a payload that has `cashFlow || dividend` (so an FMP-only value payload caches).

- [ ] **Step 1: Write failing tests** in `symbol-research.test.ts` using injected fake providers:
  - **Perplexity-down → FMP-up:** Perplexity provider returns `null` (diagnostic http-error), an injected `fmpProvider` returns a `ResearchResult` with `cashFlow`+`dividend`+`fundamentals`; assert `merged.cashFlow`/`dividend` come from FMP, `cashFlowSource==="fmp"`, `dividendSource==="fmp"`, `fundamentalsSource==="fmp"`.
  - **Perplexity-up:** Perplexity supplies cashFlow/dividend → FMP provider's `research` is **not called** (assert via a spy) and sources are `"perplexity"`.
  - **Both empty:** cashFlow/dividend `null`, sources `null`.
  - Update any existing exact-shape fixtures/`mergeSymbolResearch` callers for the new args/fields.
- [ ] **Step 2: RED. Step 3: Implement. Step 4: GREEN + typecheck + `pnpm test`.**
- [ ] **Step 5: Commit** `git commit -m "Fall back to FMP for value-quality data and tag the source"`.

---

### Task 5: researchStatus reflects FMP-supplied data + UI/source surfacing

**Files:** Modify `src/lib/server/analyze-symbol.ts`; `src/components/symbol/*` source labels; `src/components/logs/research-health-panel.tsx`.

- [ ] **analyze-symbol `defaultResearch`:** today `researchStatus: r.perplexity`. Change so the value-quality availability reflects ANY source: `const valueDataPresent = Boolean(r.cashFlow || r.dividend); const researchStatus = valueDataPresent ? "ok" : r.perplexity;` and `researchStatusReason = valueDataPresent ? null : r.perplexityReason;`. (So FMP-filled data is `"ok"` — not "data unavailable" — and doesn't penalize conviction or flag the red-team.) Keep the catch-branch as-is. Add a focused analyze test: injected research with `perplexity:"unavailable"` but `cashFlow` present (FMP) → `proposal.researchStatus === "ok"` and the value lens's cash-flow renders (not the unavailable notice).
- [ ] **Source labels:** wherever the symbol page maps a `ResearchOrigin`/source to a label (e.g. `company-profile.tsx`'s `SOURCE_LABEL = { robinhood, perplexity }`, and `stats-grid.tsx`), add an `fmp: "FMP"` entry so an FMP-sourced field is labeled honestly. Grep `SOURCE_LABEL` / `fundamentalsSource` in `src/components` and cover each.
- [ ] **Logs health line:** in `research-health-panel.tsx`, include the provider in the row (e.g. prefix `formatDiagnosticLine` output with `d.provider` — `perplexity` vs `fmp`) so the panel distinguishes the two providers. Update the `formatDiagnosticLine` test to assert the provider appears.
- [ ] **Verify:** `pnpm test`, `pnpm typecheck`, `pnpm lint`. Commit `git commit -m "Treat FMP-supplied value data as available and label the FMP source"`.

---

### Task 6: Docs + full verification + PR

**Files:** `.agents/infra.md`, `.agents/data-format.md` (if it enumerates providers).

- [ ] **`.agents/infra.md`:** document FMP as a **second sanctioned metered fundamentals provider** — free-tier, research-only (never order pricing), default-off (`FMP_API_KEY` unset), keyed, in-code daily cap (`FMP_DAILY_CALL_CAP`), and the **fallback chain: Perplexity (healthy) → FMP → unavailable**, called only when Perplexity didn't supply the value-quality data; each invocation issues several FMP requests; diagnostics land in the shared ring (Logs health panel) tagged `fmp`. Note the **v3 API + live-verification caveat**.
- [ ] **`.agents/data-format.md`:** if it lists the research providers / `usage` semantics, note FMP shares the same per-day usage counter + diagnostics ring.
- [ ] **Full verification:** `pnpm test` (green; update any remaining fixtures), `pnpm typecheck`, `pnpm lint` (all clean).
- [ ] **Commit** `git commit -m "Document the FMP fundamentals fallback provider"`, then the controller pushes + opens the PR (body must include the **live-verification caveat**: FMP v3 mapping unverified against a live key; default-off; verify before enabling).

---

## Self-Review

**Spec coverage (M2 acceptance):**
- Dedicated FMP fundamentals provider behind `ResearchProvider`, keyed, default-off → Tasks 2 + 3. ✅
- Fallback chain Perplexity → FMP → unavailable; respect limits → Task 4 (conditional fetch) + Task 2 (cap). ✅
- Tag which provider supplied each field → Task 4 (`fundamentalsSource`/`profileSource`/`cashFlowSource`/`dividendSource`, with `"fmp"`). ✅
- Perplexity-unavailable + FMP-configured → cash-flow/fundamentals populate from FMP, no longer "data unavailable" → Task 4 (merge) + Task 5 (`researchStatus` ok). ✅
- Provider tagged + fallback unit-tested (mock both, incl. Perplexity-down → FMP-up) → Task 4 tests + Task 2 tests. ✅

**Out-of-scope respected:** no gate/rail/execution change; the red-team still receives only `researchStatus` (now honestly "ok" when FMP supplies data); FMP is research-context only, never pricing. ✅

**Type consistency:** `createFmpProvider`/`FmpOpts`/`getFundamentalsFallbackProvider`/`mapFmpToResearch`/`cashFlowSource`/`dividendSource` are referenced identically across tasks. `ResearchOrigin` += `"fmp"`. Cache 8→9.

**Risk:** the FMP v3 field map (above) is unverified against a live key — Task 1's defensive coercion + the PR caveat are the mitigation. Implementers must not invent fields beyond the map; a missing field is `null`, not a guess.
