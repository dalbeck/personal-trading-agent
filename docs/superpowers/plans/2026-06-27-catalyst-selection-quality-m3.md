# Catalyst Selection Quality (M3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Pick the **material, symbol-specific** catalyst — not the first/newest headline. Filter multi-ticker roundups / "stocks moving higher" listicles out of selection, prefer headlines where the symbol is the primary subject, rank the remaining by materiality, and classify `catalystType` from the **actual selected event** (fixing the LLY bug where a co-listed company's "…stocks moving higher" roundup was picked and labeled "Earnings momentum" off Apogee's earnings).

**Architecture:** All changes are in the existing **pure, deterministic** catalyst modules (`catalyst-news.ts`, `catalyst-extract.ts`) and the server orchestrator (`catalyst-capture.ts`) — no new external dependency, no LLM/metered call (selection quality is achieved deterministically and is fully unit-testable; the analyst step remains injectable for a future LLM per the codebase's existing pattern). `extractCatalystFromNews` gains the `symbol` + `companyName` so it can detect primary-subject; the company name is threaded from the research profile through `captureCatalyst`.

**Tech Stack:** TypeScript, Vitest. Node 22 / pnpm 11. Pure modules (no `server-only` in `catalyst-news.ts`/`catalyst-extract.ts`).

## Global Constraints

- **Node 22.x / pnpm 11.9.0.** **No AI attribution** in commits/PRs/branches. Branch: `feature/catalyst-selection-quality`. Feature branch → PR → merge.
- **Research/catalyst is context-only** — never order pricing/execution. This milestone does NOT change gates, risk rails, the **red-team's numeric** behavior, or execution; it only improves WHICH headline becomes the catalyst + its type.
- **No schema change:** keep the existing `CatalystType` enum (`earnings_momentum | product_news | sector_rotation | guidance | other | none`). A regulatory/FDA/EMA approval classifies as `product_news` (the "approval/deal/launch" bucket) — do NOT add a new enum value.
- **No regression to "no catalyst":** the existing three-state honesty (`found`/`none`/`unavailable`) and the Perplexity fallback must be preserved. Filtering a roundup out of SELECTION must not turn a catalyst-rich name into `unavailable` — when only roundups mention the symbol, the chain still falls through to Perplexity (`none`/fallback), never `unavailable`.
- **Test command:** `pnpm vitest run <file>`; full suite `pnpm test`; `pnpm typecheck`; `pnpm lint`. Path alias `@/`→`src/`. Pure modules unit-tested without network.
- **Self-correction mandate:** update `.agents/infra.md` catalyst-pipeline note in the same change.

---

## Background — current behavior (the bug)

`catalyst-news.ts:extractCatalystFromNews(items)` today: filters to `isMaterialHeadline` (a catalyst keyword present, not `NOISE_PATTERNS`, not a company description), then picks `material[0]` (newest) and classifies it. Gaps:
- `NOISE_PATTERNS` does **not** catch "…Stocks Moving Higher" / "…And N Other Stocks" — so a roundup that mentions LLY survives `isMaterialHeadline`.
- There is no **symbol-primary-subject** check — a roundup or a different-company headline that Benzinga cross-tags to the symbol is treated like the symbol's own news.
- Selection is **newest-first**, not **materiality-ranked** — a generic mover can outrank an EMA approval.
- `catalystType` is classified from `material[0]` — when that is a co-listed company's earnings, LLY gets "Earnings momentum".

Headlines name the **company** ("Eli Lilly"), not the ticker ("LLY"), so primary-subject detection needs the company name (threaded from `research.profile.name`).

---

## File Structure

**Modify:**
- `src/lib/catalyst-news.ts` — strengthen roundup detection; add `isMultiTickerRoundup`, `companyNameMatches`, `isSymbolPrimarySubject`, `headlineMateriality`; rewrite `extractCatalystFromNews` to take `(items, { symbol, companyName })`, keep only symbol-primary material headlines, rank by materiality then recency, select the top, classify from IT.
- `src/lib/catalyst-news.test.ts` — new helper tests + the mixed-headline (LLY) selection test.
- `src/lib/catalyst-extract.ts` — tighten `classifyCatalyst` ordering so a regulatory/approval/M&A headline is not misbucketed as `earnings_momentum` by a stray word.
- `src/lib/catalyst-extract.test.ts` — classify cases for the reordered rules.
- `src/lib/server/catalyst-capture.ts` — thread `companyName` into `captureCatalyst` → `extractCatalystFromNews`.
- `src/lib/server/catalyst-capture.test.ts` — end-to-end capture test for the LLY scenario.
- `src/lib/server/analyze-symbol.ts` — pass `companyName: r.profile?.name` into `captureCatalyst` (success branch).
- `.agents/infra.md` — catalyst-pipeline note.

---

### Task 1: Roundup detection + symbol-primary-subject helpers (pure)

**Files:** `src/lib/catalyst-news.ts`, `src/lib/catalyst-news.test.ts`.

**Interfaces (Produces):**
- `isMultiTickerRoundup(headline: string): boolean`
- `companyNameMatches(headline: string, companyName: string): boolean`
- `isSymbolPrimarySubject(headline: string, opts: { companyName?: string | null }): boolean`
- `headlineMateriality(headline: string): number`

- [ ] **Step 1: Write failing tests** covering:
  - `isMultiTickerRoundup`: TRUE for "Apogee Therapeutics And 4 Other Stocks Moving Higher Wednesday", "10 Stocks Moving In Tuesday's Mid-Day Session", "Eli Lilly, Novo And 3 Other Stocks To Watch", "Tech Stocks Moving Lower", "Trending Stocks Today", "Why These 5 Healthcare Stocks Are Rising"; FALSE for "Eli Lilly Wins EMA Approval For Tirzepatide", "Eli Lilly Raised To Buy At Morgan Stanley".
  - `companyNameMatches`: handles suffix stripping + a leading-token alias — TRUE for ("Eli Lilly Wins…", "Eli Lilly, Inc."), TRUE for ("Lilly's Medicare Win", "Eli Lilly, Inc."), TRUE for ("Apple Unveils…", "Apple Inc."); FALSE for ("Apogee Therapeutics Phase 2 Data", "Eli Lilly, Inc.").
  - `isSymbolPrimarySubject`: with `companyName: "Eli Lilly, Inc."` → FALSE for the roundup and for "Apogee Therapeutics Phase 2 Data", TRUE for "Eli Lilly Wins EMA Approval"; with `companyName: null/undefined` → FALSE for an obvious roundup, TRUE for a non-roundup single-company headline (permissive when the name is unknown).
  - `headlineMateriality`: regulatory/M&A/clinical headline > guidance/analyst/earnings headline > a bare-keyword/generic headline; a non-material headline → 0.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.**
  - **Strengthen `NOISE_PATTERNS`** (or add to the roundup regex) to also veto: `\b(\d+\s+)?stocks?\s+(moving|trading|making|to\s+(buy|watch|consider|own|sell)|that|are|in\b)`, `\band\s+\d+\s+other\s+(stock|name|compan)`, `\bmoving\s+(higher|lower)\b`, `\btrending\s+stocks?\b`, `\bmid-?day\s+(session|movers?)\b`, `\bbiggest\s+movers?\b`, `\bstocks?\s+to\s+watch\b`. Keep the existing patterns. `isMultiTickerRoundup` = this roundup regex (export it; `isMaterialHeadline` continues to veto via the same regex).
  - `companyNameMatches(headline, companyName)`: normalize the company name — strip a trailing legal suffix (`,?\s*(inc|corp|corporation|co|ltd|plc|sa|nv|ag|holdings?|group|company|the)\.?$` iteratively) and punctuation → a `core` (e.g. "Eli Lilly"). Return true if the headline (case-insensitive, word-boundaried) contains the `core` OR the last significant token of the core with length ≥ 4 (e.g. "Lilly"; skip generic tokens like "Group"/"Holdings"/"Technologies"/"Therapeutics"/"Inc"). Guard empty input.
  - `isSymbolPrimarySubject(headline, { companyName })`: `if (isMultiTickerRoundup(headline)) return false;` then `if (companyName) return companyNameMatches(headline, companyName);` else `return true;`.
  - `headlineMateriality(headline)`: `0` if `!isMaterialHeadline(headline)`. Else score by the strongest category present: **3** — regulatory/clinical/M&A: `/\b(fda|ema|chmp|approv|clears?|cleared|authoriz|breakthrough|phase\s?[123]|trial|clinical|acquir|acquisition|merger|buyout|takeover|to buy)\b/i`; **2** — guidance/analyst/earnings/product/policy: `/\b(guidance|outlook|forecast|raises?|raised|reaffirm|reiterat|upgrad|downgrad|price target|initiat|rating|analyst|earnings|eps|beat|miss|revenue|guides?|medicare|medicaid|reimburs|contract|partnership|collaborat|launch|unveil|dividend|buyback|repurchase)\b/i`; **1** — any other material keyword. (First match from highest bucket wins.)
- [ ] **Step 4: GREEN + typecheck.**
- [ ] **Step 5: Commit** `git commit -m "Add roundup, primary-subject, and materiality helpers for catalyst selection"`.

---

### Task 2: Rank-and-select rewrite of `extractCatalystFromNews`

**Files:** `src/lib/catalyst-news.ts`, `src/lib/catalyst-news.test.ts`.

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `extractCatalystFromNews(items, opts: { symbol: string; companyName?: string | null }): CapturedNewsCatalyst` (signature change — adds the required `opts`).

- [ ] **Step 1: Write the failing mixed-headline (LLY) test.** Given items newest-first:
  1. `"Apogee Therapeutics And 4 Other Stocks Moving Higher Wednesday"` (roundup, mentions LLY only via tag)
  2. `"Eli Lilly Raised To Overweight At Morgan Stanley"` (analyst, materiality 2)
  3. `"Eli Lilly Wins EMA Approval For Tirzepatide In Europe"` (regulatory, materiality 3)
  with `{ symbol: "LLY", companyName: "Eli Lilly, Inc." }`, assert:
  - `catalyst` is the **EMA approval** headline (highest materiality among symbol-primary), NOT the roundup and NOT merely the newest.
  - `catalystType === "product_news"` (NOT `earnings_momentum`).
  - the roundup headline is **excluded from `sources`** (sources are the symbol-primary material headlines).
  - A separate case: items where the ONLY material headline mentioning the symbol is a roundup → `catalyst === null` (so the caller falls through to Perplexity), `sources: []`.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement** the rewrite:
  ```
  export function extractCatalystFromNews(items, opts) {
    const material = (items ?? []).filter((it) => isMaterialHeadline(it.headline));
    const primary = material.filter((it) =>
      isSymbolPrimarySubject(it.headline, { companyName: opts.companyName }));
    if (primary.length === 0) return { catalyst: null, catalystType: null, sources: [] };
    // Rank: materiality desc, then recency (input is newest-first, so keep a stable
    // index as the recency tiebreak — lower index = newer).
    const ranked = primary
      .map((it, i) => ({ it, i, score: headlineMateriality(it.headline) }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
    const top = ranked[0].it;
    const sources = ranked.slice(0, MAX_SOURCES).map(({ it }) => ({ headline: it.headline.trim(), publisher: it.publisher, url: it.url, publishedAt: it.publishedAt }));
    return { catalyst: truncateOnWord(top.headline, CATALYST_MAX), catalystType: classifyCatalyst(top.headline), sources };
  }
  ```
  (Sources keep materiality order so the strongest why-now leads the list.)
- [ ] **Step 4: GREEN + typecheck.** Update the in-repo callers of `extractCatalystFromNews` (Task 3 supplies `opts`; until then the only caller is `catalyst-capture.ts`).
- [ ] **Step 5: Commit** `git commit -m "Rank catalyst headlines by materiality and symbol-primary subject"`.

---

### Task 3: Thread `companyName` through capture + classify ordering

**Files:** `src/lib/server/catalyst-capture.ts`, `src/lib/server/catalyst-capture.test.ts`, `src/lib/catalyst-extract.ts`, `src/lib/catalyst-extract.test.ts`, `src/lib/server/analyze-symbol.ts`.

- [ ] **Step 1 (classify ordering):** In `catalyst-extract.ts:classifyCatalyst`, reorder so a regulatory/approval/M&A/clinical headline is NOT captured by the `earnings` rule first. Put the product/regulatory/M&A bucket BEFORE earnings when an approval/M&A/clinical keyword is present. Concretely: check `/\b(approv|clears?|cleared|fda|ema|chmp|acquir|acquisition|merger|buyout|takeover|launch|unveil|partnership|contract|deal|product)\b/` → `product_news` first; then earnings; then guidance; then sector. Add a test: `classifyCatalyst("Eli Lilly Wins EMA Approval For Tirzepatide")` → `product_news` (not `earnings_momentum` even though "Tirzepatide" etc.); `classifyCatalyst("Acme Q2 EPS Beats")` → `earnings_momentum`. Write the test first (RED).
- [ ] **Step 2 (thread companyName):** Add `companyName?: string | null` to `CaptureCatalystOpts`. In `captureCatalyst`, pass it into `extractCatalystFromNews(news, { symbol: opts.symbol, companyName: opts.companyName })`.
- [ ] **Step 3 (analyze-symbol):** In `defaultResearch`'s success branch, pass `companyName: r.profile?.name` into the `captureCatalyst({...})` call (the catch branch leaves it undefined).
- [ ] **Step 4 (capture test):** In `catalyst-capture.test.ts`, add an end-to-end test: an injected `fetchNews` returning the LLY mixed set (roundup + analyst + EMA approval), `captureCatalyst({ symbol: "LLY", companyName: "Eli Lilly, Inc.", perplexityStatus: "ok" })` → `state: "found"`, `source: "alpaca-news"`, `catalyst` is the EMA approval, `catalystType: "product_news"`, and the roundup is not in `sources`. Also confirm the existing fallback/none/unavailable tests still pass (update any `extractCatalystFromNews` call shapes).
- [ ] **Step 5: GREEN across** `catalyst-news.test.ts catalyst-extract.test.ts catalyst-capture.test.ts analyze-symbol.test.ts`; `pnpm typecheck`; `pnpm lint`; `pnpm test`.
- [ ] **Step 6: Commit** `git commit -m "Thread the company name into catalyst capture and fix approval classification"`.

---

### Task 4: Docs + full verification + PR

**Files:** `.agents/infra.md`.

- [ ] **`.agents/infra.md`:** in the catalyst-pipeline paragraph (the `catalyst-capture.ts` / Alpaca-News note), document the selection-quality upgrade (catalyst-selection-quality M3): roundup/listicle headlines ("…stocks moving higher", "and N other stocks") are filtered from SELECTION; the catalyst is chosen as the **highest-materiality, symbol-primary** headline (company name threaded from the research profile), not merely the newest; `catalystType` is classified from the selected event; a symbol mentioned only in roundups falls through to Perplexity (never a false `unavailable`).
- [ ] **Full verification:** `pnpm test` (green; update any remaining fixtures), `pnpm typecheck`, `pnpm lint`.
- [ ] **Commit** `git commit -m "Document the catalyst selection-quality upgrade"`, then the controller pushes + opens the PR.

---

## Self-Review

**Spec coverage (M3 acceptance):**
- Prefer headlines where the SYMBOL is the primary subject; filter multi-ticker roundups / "stocks moving higher" → Task 1 (`isMultiTickerRoundup`/`isSymbolPrimarySubject`) + Task 2 (primary filter). ✅
- Rank by materiality (regulatory/FDA/EMA/M&A/clinical > guidance/analyst > generic) → Task 1 (`headlineMateriality`) + Task 2 (sort). ✅
- Synthesize from the top relevant headlines + set `catalystType` from the actual event → Task 2 (select top, classify from IT) + Task 3 (classify ordering fix). Deterministic selection (the analyst step stays injectable for a future LLM). ✅
- Acceptance: catalyst-rich symbol → material symbol-specific catalyst (EMA approval / Medicare), roundups filtered from selection (kept-out of sources), `catalystType` matches the event, tested with a mixed set incl. a roundup → Task 2 + Task 3 tests. ✅

**Out of scope respected:** no schema change (no new `CatalystType`); no gate/rail/red-team-numeric/execution change; no new external/LLM call; three-state honesty + Perplexity fallback preserved (roundup-only → null → fallthrough, never a false `unavailable`).

**Type consistency:** `extractCatalystFromNews(items, { symbol, companyName })`, `isMultiTickerRoundup`, `isSymbolPrimarySubject`, `companyNameMatches`, `headlineMateriality` referenced identically across tasks. `CaptureCatalystOpts.companyName` flows to `extractCatalystFromNews`.
