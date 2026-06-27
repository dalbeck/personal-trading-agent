# Data Format Rules

How everything the engine writes into `data/` is stored, so the dashboard reads
it cleanly and the AI ingests it consistently. **Binding** — readers, writers,
and routines must follow this. The runtime contracts live in
`src/lib/schemas.ts` (zod); the TypeScript types are inferred from them.

## The three rules

1. **Narrative → Markdown + YAML frontmatter** (`.md`).
   Frontmatter holds the structured/scalar fields; the markdown **body** holds
   the prose. Applies to `data/decision-journal/`, `data/coaching-log/`, and
   `data/chats/`.
2. **Structured → JSON** (`.json`).
   Pure machine state, validated against the typed contracts. Applies to
   `data/snapshots/`, `data/proposals/`, `data/fills/`, `data/logs/`.
3. **MDX → trusted, statically-authored docs only.**
   Never render dynamic/LLM-generated content as MDX (it executes arbitrary
   JS). Dynamic markdown is rendered through the safe `Markdown` component —
   see `.agents/nextjs.md`.

| Directory | Format | Contract (`src/lib/schemas.ts`) |
|-----------|--------|----------------------------------|
| `data/decision-journal/` | `.md` + frontmatter | `JournalEntrySchema` (trade \| rejection) |
| `data/coaching-log/` | `.md` + frontmatter | `CoachingEntrySchema` |
| `data/chats/` | `.md` + frontmatter | _(added when the chat archive lands)_ |
| `data/snapshots/` | `.json` | `PortfolioSnapshotSchema` |
| `data/proposals/` | `.json` | `TradeProposalSchema` (paper or live-`advisory`) |
| `data/news/` | `.json` | `NewsFileSchema` (array of material items, one file per day) |
| `data/fills/` | `.json` | _(added in Phase 2)_ |
| `data/logs/` | `.json` | `RunLogSchema` (one per routine run) |
| `data/research/` | `.json` | `ResearchUsageSchema` (per-day metered-API call counter) |
| `data/research/cache/` | `.json` | symbol-research cache (`<SYMBOL>.json`, `fetchedAt`-stamped freshness, internal state — not a contract) |

**Tracked universe + account scoping (M2/M3).** The **watchlist** — the editable
half of the tracked universe — is a small JSON state file
`data/control/watchlist.json` (`WatchlistSchema`: `{ entries, updatedAt }`, each
entry `{ symbol, source, addedAt }`). `source` is **`manual`** (the human typed
it) or **`discovery`** (the autonomous discovery routine auto-tracked it, M3).
Read via `readWatchlistEntries` (legacy `{ symbols: [...] }` files migrate to
manual entries) / `readWatchlist` (symbols only); written by `addToWatchlist`
(manual; promotes a discovery entry on re-add) / `removeFromWatchlist` /
`addDiscoveredToWatchlist` (capped at `DISCOVERY_LIMITS.maxWatchlistSymbols`,
never evicts a manual entry, via `POST /api/watchlist/discover`). Holdings (the
auto half) come from the snapshots; the union (`src/lib/server/universe.ts`)
feeds the news scout and research routine and drives ownership badges. Journal and coaching
entries now carry an **`account`** (`paper` | `live`, default `paper`); a trade
entry also carries **`manual`** (default `false`). A `live` + `manual: true`
journal entry is a trade the human placed by hand, ingested **read-only** from
Robinhood order history (`syncLiveTrades`) for coaching — the desk never places
it. `data/control/live-trades.json` tracks already-ingested broker order ids so
the sync is idempotent (an internal state file, like the halt latch / funding
tracker — written directly, not a `data/` artifact contract). Coaching entries
stay behavior-driven: `paper` reviews grade the desk; `live` reviews coach the
live book's behavior (human-approved desk exits/trims **and** the human's manual
fills), kept in separate entries so the paper-desk evaluation is never
contaminated. **The evaluation surfaces are account-scoped too (Phase 3 M3, no
bleed):** `getEvaluationScorecard` and `getGovernanceScorecard` filter the
journal/snapshots/proposals to **`paper`** (a live trade or a routinely-refreshed
live snapshot can no longer inflate the paper stats or falsely trip the
"real-money path" integrity flag), and the Evaluation LIVE view renders the live
book's own performance (`buildLiveBookPerformance` — P&L vs cost basis, vs SPY
where the snapshot carries a benchmark, exits taken) plus a live-scoped
governance card. The EOD summary + weekly review routines cover both books in
clearly-labelled, separate sections. `data/control/risk-settings.json` (`RiskSettingsSchema`)
is the human's per-rail overrides of the charter `RISK_LIMITS` — likewise an
internal state file (written directly, not a `data/` artifact contract), layered
in at per-trade approval (`src/lib/server/risk-settings.ts`; see `.agents/infra.md`).
`data/control/discovery-settings.json` (`DiscoverySettingsSchema`, M3) is the
human's tuning of the discovery **review funnel** — `ideaCap`,
`maxProposalsPerSector`, `minSectorsTarget`, `minConvictionTier` (the queue's
default display filter), and **`valueSleeveEnabled`** (value-sleeve M1; off by
default — when on, a discovery run may also surface `strategy: "value"`
candidates, separate from the trend universe and judged by the value red-team
lens). **Preferences, NOT safety rails** — explicitly separate from the risk
rails and the 6-order/day cap; a value candidate still clears the same shared
hard rails + red-team. `effectiveDiscoveryLimits`
(`src/lib/server/discovery-settings.ts`) overlays them over the charter
`DISCOVERY_LIMITS` and **clamps to the charter ceilings** (the idea cap can never
exceed `maxIdeaCap`), so the agent can never widen the funnel past its bound.
The pre-market routine reads it for the effective caps; the proposals queue reads
`minConvictionTier` for its default filter. Another internal state file (written
directly, not a `data/` artifact contract).
`data/control/order-counter.json` (`{ date, count }`, ET calendar day) is the
**persisted per-ET-day order counter** — incremented at each placement (the
paper batch + every human approval) and read back as `RiskContext.ordersToday`
so the charter daily-order cap (≤6/day) fires across runs and across paths, and
resets at the New York day boundary (`src/lib/server/order-counter.ts`). Another
internal state file — written directly, not a `data/` artifact contract.
`data/control/market-conditions.json` (`{ vix, fetchedAt }`) is the **short-TTL
VIX cache** (~10 min) so the slow Robinhood `get_index_quotes` spawn doesn't
block every approval — likewise an internal state file
(`src/lib/server/market-conditions.ts`).
`data/control/regime.json` (the `RegimeContext` plus a `fetchedAt`) is the
**advisory market-regime cache** (M4, ~60-min TTL) — SPY trend, VIX band, and
sector-ETF rotation, computed from Alpaca daily bars and shared by the dashboard
strip and the pre-market routine (`/api/regime`). **Advisory context only** — it
is not a rail or a gate and sizes nothing; fail-soft to a neutral read on any
data gap. Another internal state file (`src/lib/server/regime.ts`) — written
directly, not a `data/` artifact contract. The **research cache**
(`data/research/cache/<SYMBOL>.json`) is now keyed by symbol (not symbol+date)
and carries a `fetchedAt` stamp: `getSymbolResearch` serves it unless older than
a soft max-age (`RESEARCH_MAX_AGE_DAYS`, default 7) or a manual refresh forces a
refetch, so crossing midnight no longer re-spends a metered call. The
Perplexity daily cap still gates every refetch; a capped refresh keeps the
existing cache.
`data/control/placed-orders/<hash>.json` (one file per **client order id**,
`PlacedRecord`) is the **order idempotency** ledger: each placed order's
`{ destination, brokerOrderId, journalId }` is recorded under its stable client
order id so a double-tap or retry returns the prior placement instead of placing
again (`src/lib/server/order-idempotency.ts`). Per-id files (hashed filename)
avoid a shared-file write race; like the others, internal state — written
directly, not a `data/` artifact contract, malformed = treated as "not placed".

**Proposal `account` / `advisory` (live vs paper).** A `TradeProposal` carries
`account` (`paper` | `live`, default `paper`) and `advisory` (default `false`).
**`advisory` is the intent flag, independent of account** (M5a):
- **advisory `true`** — manual guidance; terminal states `reviewed` / `dismissed`
  (via `POST /api/proposals/review`); **never** routed to an order path (the
  approval endpoint refuses it).
- **advisory `false`** — approvable; flows the approval path
  (`POST /api/live/approve`) → terminal `approved` / `rejected`. A **paper**
  one routes to the paper engine; an **approvable live** one
  (`account: "live"`, `advisory: false`, written by `recordApprovableLiveProposal`)
  routes by the order gate — closed → dry-run sink, open → Robinhood. The gate,
  not the account, is the real-money boundary (see `.agents/infra.md`).

**Proposal `origin` (M2 manual analyze).** A `TradeProposal` also carries
`origin` (`discovery | manual-request`, nullable). `manual-request` marks a
proposal produced by the on-demand **"analyze a symbol"** pipeline
(`src/lib/server/analyze-symbol.ts`, `POST /api/proposals/analyze`) for a
human-entered ticker — the full pipeline (research → build → **risk rails →
red-team**) still ran, so a weak manual pick is **flagged, not rubber-stamped**.
It is written by `recordManualProposal` (account-aware: a paper request is a
normal paper proposal; a live request is approvable and flows the gated approval
path, gate closed → dry-run sink). On approval the journal entry inherits a
`manual-request` **tag** (the approve route maps `origin` → tags). `null`
default reads as `discovery` (older records / the autonomous pre-market run).

**Proposal `targetType` / `sector` (M3 governance).** A `TradeProposal` also
carries `targetType` (`prior_high | measured_move | atr_multiple | fundamental |
analyst_price`, nullable for back-compat) and `sector` (GICS string, nullable).
`targetType` records how the profit target is anchored — a well-formed proposal
sets it, and an `analyst_price` (sell-side) target or a missing one is **flagged
weak** by the checklist/red-team, not hard-blocked. `sector` feeds the
**concentration rail** (≤ 40% of equity per sector); when null the rail can't
fire for that name (fails open). Both default to `null` so older records still
validate.

**Proposal `relativeVolume` (M2 volume check).** A `TradeProposal` also carries
`relativeVolume` (nullable number) — the **entry-day volume ÷ the trailing
20–50-day average** (`computeRelativeVolume` in `src/lib/volume.ts`). It is a
**volume confirmation**: a breakout/momentum entry wants **above-average**
volume (≥ ~1.3×), a pullback/reset entry wants **below-average** volume. A
**soft signal** the checklist + red-team weigh (never a hard rail); it is
surfaced on the proposal card and the symbol view (Rel. volume). `null` when
unknown or history is too thin to be meaningful (older records, illiquid names)
— rendered as "—", never a fabricated figure. Defaults to `null` so older
records still validate.

**Proposal `catalyst` / `catalystType` (M3 catalyst requirement).** A
`TradeProposal` also carries `catalyst` (a one-line "why now", nullable) and
`catalystType` (`earnings_momentum | product_news | sector_rotation | guidance |
other | none`, nullable for back-compat). The desk wants a **named catalyst** on
every entry; a `catalystType` of **`none`** (trend alone) — or a missing one — is
**flagged weak** by the checklist/red-team (`isWeakCatalyst` in
`src/lib/catalyst.ts`), not hard-blocked. Surfaced on the proposal card
(Catalyst). Both default to `null` so older records still validate.

**Proposal `strategy` (value-sleeve M1).** A `TradeProposal` carries a
**`strategy`** (`trend` | `value`, default **`trend`**) — which mandate it is
judged under. `trend` is the desk's primary technical trend-following strategy
(the default and every older record). `value` is a deliberately **separate**
value / mean-reversion sleeve: **fundamentals lead**, counter-trend is *expected*
(below the moving averages is normal, not a strike), and the red-team is briefed
with the **matching** lens (`buildProsecutorPrompt` branches on `strategy`;
`src/lib/server/red-team.ts`). The derived pre-trade checklist also adapts
(`buildChecklist` in `src/lib/checklist.ts`): the value checklist reframes
stop/target/catalyst for a value lens and **drops the breakout-volume item**. The
**hard risk rails are shared and unchanged** across both mandates — only the
entry-thesis criteria and the red-team lens differ. The UI shows a **strategy
badge** on the proposal row + detail modal (`src/lib/strategy-style.ts`). Value
proposals come from the manual analyze-a-symbol **lens** picker (`strategy` in
the `POST /api/proposals/analyze` body) and, when enabled, the discovery run (see
`valueSleeveEnabled` below). Defaults to `trend` so older records still validate.

**Proposal `dividend` (dividend-floor M1).** The **value lens's** dividend-floor
signal — a `DividendSignalsSchema` block: `dividendYield` / `payoutRatio` /
`fcfPayout` / `dividendCagr` (fractions), `fcfCoverage` (FCF ÷ dividends, a
multiple — the parser derives it from `fcfPayout` and vice-versa), and
`growthStreakYears`. Value lens only (trend stays null); folded into the **same
capped value research fetch** — no extra call: the Perplexity adapter requests a
`dividend` key in its one JSON block and `coerceDividend`
(`src/lib/server/research/parse.ts`, pure + unit-tested) parses it, falling back
to the fundamentals yield. The pure `assessDividendFloor` (`src/lib/dividend.ts`)
decides: a durable, **well-covered** dividend (FCF coverage ≥ healthy, payout not
stretched) is a **registered value floor** — its concrete text (e.g. `Dividend
floor: FCF covers 2.4×, 14-yr growth streak`) **populates the value lens's
`catalyst`** (instead of "Unspecified", only when no other named catalyst exists)
so the "Catalyst or floor" checklist item passes and the value red-team weighs a
real floor; an **uncovered / at-risk** dividend (FCF doesn't cover it, payout
stretched) is a value-trap flag, never a floor. It also **lifts (or, at-risk,
drags) value conviction** (`scoreValueConviction` gains a dividend term) and is
briefed to the value red-team (`dividendBriefing`). **Discipline:** a safe
dividend *satisfies* the floor requirement but does **not** auto-approve — the
red-team stays categorical and may still weigh timing. Surfaced as a dividend stat
block (`src/components/dividend-block.tsx`, glossary tooltips). Mirrors the active
lens at the top level; defaults to null so older records still validate. (Research
cache `CACHE_VERSION` bumped to 7.)

**Proposal `pricedAt` (fresh-entry-levels M1).** A `TradeProposal` carries
**`pricedAt`** (ISO datetime, nullable) — when the levels (entry/stop/target/
sizing) were **anchored to the live Alpaca quote**. The manual analyze pipeline
anchors the entry to the *current* quote (`getLatestPrice`, snapshot→last-bar
fallback) rather than a stale daily-bar close, so the stop / reward-risk / sizing
are computed off the price the market is actually at; both lenses share the one
quote. Set to `createdAt` at analysis and **updated on a "Refresh levels"
re-anchor** (`refreshProposalLevels` → `overwriteProposal`, same id/file — it
recomputes every lens off a fresh quote and re-runs each red-team, but spends no
new metered research). It drives the **levels-freshness indicator** ("levels as
of … · price now $X") and the **approval staleness guard**: at approval the entry
is compared to the current quote and an order whose entry has drifted beyond
`STALE_DRIFT_THRESHOLD` (1.5%) is **blocked until refreshed** — a correctness gate
that, unlike a rail/red-team block, is **not** clearable by an override comment
(`src/lib/price-freshness.ts`, `src/lib/server/live-order.ts`). Null for older
records → the UI falls back to `createdAt`. Defaults to null so older records
still validate.

**Proposal `stagedPlan` (staged-entry-plan M2).** A `TradeProposal` carries an
optional **`stagedPlan`** (`StagedEntryPlanSchema`, nullable) — a DCA / scale-in
plan that splits the **full intended position** into tranches. The block holds
`trancheCount`, `intervalDays`, `driftBandPct` (the ±band vs the prior fill), and
`tranches[]` (each `StagedTrancheSchema`: `index`, `fraction`, `qty`,
`offsetDays`, `status` `pending|filled|skipped`). The tranche qtys **sum back to
the proposal's full qty**, so **risk stays sized on the full position** — the stop
+ ≤2% rail bind the completed position. Built by the pure `buildStagedEntryPlan`
(`src/lib/staged-entry.ts`, unit-tested; defaults `STAGED_ENTRY_DEFAULTS` =
3 tranches / 5 days / ±5%), attached or removed via `POST /api/proposals/[id]/staged-plan`
(`setStagedPlan`). **No auto-execution:** each tranche is a separate **gated
per-trade human approval** — the approve route (`POST /api/live/approve`) accepts
a `tranche` index, places **only that tranche's qty** (idempotency key
`<id>#t<index>`, so each tranche dedupes independently), tags the journal
`tranche:k/N`, and `markTrancheFilled` flips just that tranche to `filled`; the
proposal only becomes `approved` once **every** tranche is filled. Each tranche
still clears the staleness guard + risk rails + red-team, and counts against the
6-order/day cap (per placement). Surfaced on the detail page (tranche table) and
in the MD/PDF export. Defaults to null so older records still validate.

**Proposal `lenses` (dual-lens M1).** A **manual** analyze-a-symbol proposal is
evaluated under **both** the trend and value mandates and carries **both**
breakdowns in **`lenses`** (an array of `ProposalLensSchema`: per-lens
`strategy`, levels — `limitPrice`/`stopPrice`/`takeProfit`/`targetType`, `qty`,
`riskPct`, `relativeVolume`, catalyst, conviction, `thesis`/`reasoning`, and its
own **`redTeam`** verdict judged by that mandate). The proposal's **top-level
fields mirror the active lens** — the higher-conviction one by default (tie →
trend) — for the slim list + execution + back-compat. `lenses` is **empty `[]`
for single-lens** proposals (every **discovery** candidate — discovery stays
single-lens — and older manual records), in which case the top-level fields ARE
the lone lens. The detail page derives the per-lens view via `buildProposalLenses`
(`src/lib/proposal-lens.ts`) and shows a glanceable dual-verdict summary + a
Trend/Value toggle when `isDualLens`; the **acting lens at approval** is picked
by `resolveActiveLens` — its levels + red-team verdict drive the order, and the
journal records it as a `lens:<strategy>` tag. The manual pipeline fetches
research **once** (shared across both lenses) so the Perplexity cap is respected.
Defaults to `[]` so older records still validate.

**Proposal `cashFlow` (value-cashflow M1).** The **value lens's** floor-vs-trap
signal — a `CashFlowQualitySchema` block: `operatingCashFlow` / `freeCashFlow` /
`netDebt` (USD; net debt may be negative = net cash), **`fcfYield`** (a fraction,
`0.041` === 4.1% — FCF ÷ market cap), `fcfTrend` (`growing | stable | declining`),
and `debtToEquity` / `interestCoverage` (plain multiples). Every field is
nullable; the whole block defaults to **`null`**. It is carried on the **value**
`ProposalLensSchema` breakdown **only** (the trend lens stays `null`), and on the
proposal's **top-level `cashFlow`** mirroring the **active** lens (so a
value-active proposal carries it, a trend-active one is `null`). It is folded
into the **same capped Perplexity value research fetch** — no extra call: the
Perplexity adapter requests the cash-flow keys in its one JSON block and
`coerceCashFlow` (`src/lib/server/research/parse.ts`, pure + unit-tested) parses
them, **deriving `fcfYield` from `freeCashFlow ÷ marketCap`** when the model
didn't give one. It drives the **"Cash-flow quality"** value-checklist item
(pass on durable, positive FCF + healthy yield + manageable leverage; flag on
negative/declining FCF or rising leverage; `na` when no data — the pure
`assessCashFlowQuality` in `src/lib/cash-flow.ts`), the **value red-team's**
floor-vs-trap weighting (`buildProsecutorPrompt` briefs it in the value branch
only), and a **cash-flow stat block** in the value breakdown
(`src/components/cash-flow-block.tsx`, glossary tooltips on FCF / FCF yield /
interest coverage). **Value lens only** — the trend lens, gates, and hard rails
are unchanged. Defaults to `null` so trend records + older proposals still
validate. (The research cache `CACHE_VERSION` bumped to 6 so stale entries
re-fetch with the new block.)

**Proposal `convictionScore` / `convictionTier` (M1 diversified discovery).** A
`TradeProposal` also carries `convictionScore` (a `0–1` composite of the playbook
signals — trend, momentum, relative strength, volume, R:R, catalyst) and
`convictionTier` (`high | moderate | watch`, nullable). The discovery analyst
assigns the score; the tier is its labelled bucket (**high ≥ 0.7 · moderate ≥
0.4 · watch < 0.4**, `convictionTierFromScore` in `src/lib/conviction.ts`). The
queue **sorts strongest-first** (`compareByConviction`) and shows **all tiers by
default** — the tier drives sort + an optional view filter, never hiding by
default; the badge presentation is `src/lib/conviction-style.ts`. It is a
**review-funnel preference, not a safety rail** — every tier still clears the
hard risk rails + the red-team. The funnel itself is bounded by
`DISCOVERY_LIMITS` (`charter.config.ts`): `ideaCap` (~20, the per-run proposal
ceiling — a review-funnel preference **decoupled from** the hard 6-order/day
rail, tunable up to `maxIdeaCap` 40), `maxProposalsPerSector` (best-in-sector
cap, 3) and `minSectorsTarget` (sector spread, 3); `selectDiscoveryCandidates`
(`src/lib/discovery.ts`) does the pure best-in-sector / spread selection. Both
fields default to `null` so older records still validate.

**Conviction honesty (conviction-honesty M1).** Two honesty rules layer onto the
above. (1) **Unknown key quality data is a penalty, not neutral:** when a **value**
proposal's **cash-flow** data is unknown (`qualityDataKnown=false`, fed from
`hasCashFlowData`), `scoreValueConviction` (`src/lib/proposal-builder.ts`, pure +
unit-tested) drags the score (`CONVICTION_UNKNOWN_QUALITY_DRAG`) **and caps it
below "high"** (`CONVICTION_UNKNOWN_QUALITY_CAP` < `CONVICTION_HIGH_MIN`, both in
`src/lib/conviction.ts`) — a value play whose cash flow we can't verify can never
read high-conviction. (2) **Conviction is a ranking signal, NOT a verdict — the
red-team verdict is the headline.** The UI subordinates conviction: the detail
header shows the **red-team verdict prominently** (semantic pill), and the
conviction badge is rendered through the verdict-aware `convictionDisplay`
(`src/lib/conviction-display.ts`, pure + unit-tested) — framed as a "signal" and,
when the matching red-team **rejects**, shown **muted** with a "red-team reject ·
ranking only" note (never a bare green "high" on a rejected proposal). No
data-model change for (2) — display only; the score penalty (1) is stored in
`convictionScore`/`convictionTier` at build time.

**Red-team verdict (structured rationale).** The prosecutor's verdict on a
proposal is **structured, not one text blob** (`RedTeamVerdictSchema` in
`src/lib/schemas.ts`):

- **`verdict`** — `approve` | `concern` | `reject`. Drives the semantic verdict
  badge (approve → success/green, concern → warning/amber, reject → danger/red,
  per `.agents/design-system.md`'s verdict rule) and the order policy
  (`reject` → block unless human-overridden; see `.agents/infra.md`).
- **`notes`** — the prosecutor's primary objection (or, when approving, why the
  thesis survived). Required, kept for back-compatibility: older proposals that
  predate the structured fields carry only `verdict` + `notes`.
- **`factors`** — an ordered array of keyed assessments
  (`RedTeamFactorSchema`: `{ label, assessment, stance }`). `label` names the
  dimension (`Entry`, `Target`, `Stop`, `Edge`, `Risk/Reward`, …); `assessment`
  is the prosecutor's short take; `stance` is `supports` | `refutes` |
  `neutral` and colours the row. Defaults to `[]` — the UI falls back to
  `notes` when empty so old records still render.
- **`basis`** — a one-line "how it decided" / conviction summary. Nullable
  (`null` for older records).

The gate still **fails closed**: an unparseable/unavailable prosecutor yields
`verdict: reject` with an explanatory `notes` and no factors. The structured
shape is parsed best-effort — a prosecutor that returns only `{verdict, notes}`
is still valid.

## Frontmatter conventions

- The frontmatter is a flat YAML **mapping** (`key: value`), delimited by `---`
  lines at the very top of the file. The body is everything after the closing
  `---`.
- **Quote ISO dates and timestamps** (`timestamp: "2026-06-20T09:41:00-04:00"`,
  `reviewDate: "2026-07-21"`). The reader parses frontmatter with js-yaml's
  `JSON_SCHEMA`, so values stay strings either way — but quoting keeps them
  unambiguous for humans and other tools, and preserves the UTC offset.
- Numbers are plain (`qty: 9`, `price: 432.75`); ratios are fractions
  (`riskPct: 0.0152` === 1.52%). Nullable fields are `null`. String arrays use
  block or flow form (`tags: [megacap, trend-pullback]`).
- The prose body is required (`body` in the schema) and is **not** placed in
  frontmatter.

### Body conventions

- **Decision journal:** the trade write-up — thesis as the lead, then the
  reasoning. The structured facts (symbol, action, qty, price, stop, target,
  risk, review date) live in frontmatter and are rendered as the card header,
  so the body is pure narrative. A **risk-rail rejection** also carries
  `rule:<id>` **tags** (one per violated rail, e.g. `rule:sector-concentration`)
  so the governance scorecard (M4) counts per-rule rejections without parsing the
  prose reason (`recordRiskRejection`).
- **Coaching log:** the self-review, labelled `**Expected.**` / `**Actual.**` /
  `**Lesson.**`. `grade`, `period`, `relatedJournalIds`, and
  `promotedToPlaybook` stay in frontmatter.

### Example — `data/decision-journal/2026-06-20-msft-buy.md`

```markdown
---
kind: trade
id: j-2026-06-20-msft
timestamp: "2026-06-20T09:41:00-04:00"
symbol: MSFT
action: buy
side: long
qty: 9
price: 432.75
stopPrice: 415
takeProfit: 478
riskPct: 0.0152
reviewDate: "2026-07-21"
tags: [megacap, trend-pullback, earnings-runup]
---

Megacap software leadership intact; **Copilot** attach rates are lifting Azure
guidance into the next print.

Pullback to the rising 50-day held with a higher low; entered a marketable-limit
above the morning range.
```

## Sample-data marker (`sample`)

Seeded/demo records carry **`sample: true`** so the dashboard never shows
fabricated content as if it were live — a real trust hazard for a trading tool.

- **Where:** a boolean field on the record. JSON records (proposals, news items)
  use `"sample": true`; markdown records would use `sample: true` in
  frontmatter. The contracts default it to `false`
  (`TradeProposalSchema`, `MaterialNewsItemSchema` in `src/lib/schemas.ts`), so
  **live records written by the routines/scout simply omit it.**
- **Propagation:** readers return the flag like any other field (it's on the
  schema). Any view rendering one or more sample records must surface a clear
  **"Sample data"** indicator — the shared `SampleDataBanner` / `SampleDataBadge`
  (`src/components/sample-data-badge.tsx`), gated on `anySample()`
  (`src/lib/sample-data.ts`). News, Proposals, and the Overview "Awaiting review"
  module already do this.
- **Clearing (two actions, both confirm-gated in the Operations panel,
  `src/lib/ops.ts`):**
  - `scripts/clear-seed-data.sh` (`clear-seed-data`) removes only
    sample-flagged files (idempotent), leaving live records in place. It reports
    **honestly**: when nothing is flagged but unflagged artifacts still remain,
    it says so and points at Reset desk data — it never implies the panels are
    clean while they still render records.
  - `scripts/reset-desk-data.sh` (`reset-desk-data`) clears **all** desk
    artifacts (flagged or not) so every panel shows its honest empty state. Both
    resolve `DATA_DIR` as `${TRADING_DATA_DIR:-<repo>/data}` — the same directory
    the app reads from — and both leave the runtime/safety dirs (`locks/`,
    `control/`: the trading HALT latch + funding tracker) untouched.
- The running app reads only from the resolved `DATA_DIR`; the committed
  fixtures (`src/test/fixtures/`, all `sample: true`) are a **test-only** data
  source, wired in via `TRADING_DATA_DIR` solely by `vitest.config.ts` — never a
  live source. `src/test/no-fixtures-at-runtime.test.ts` is the tripwire: it
  fails if any runtime config surface points the app at the fixtures.

## Writing

- The engine writes narrative artifacts through `src/lib/server/writers.ts` —
  never hand-build a file. `recordTradeDecision` / `recordRejection` (and
  `recordRiskRejection`, which turns a blocked `RiskDecision` into a journaled
  `rules` rejection) write the decision journal; `recordCoaching` writes the
  coaching log; `promoteLessonToPlaybook` appends a banked lesson with
  provenance. Every writer **validates against the zod contract before writing**
  and refuses to emit an invalid artifact.
- Body prose is composed by the pure helpers in `src/lib/journal-format.ts`
  (thesis-lead + labelled sections for journal; Expected/Actual/Lesson for
  coaching). Frontmatter is serialized by `stringifyFrontmatter`.

## Reading & validation

- Readers live in `src/lib/server/data.ts`. `readMarkdownDir` splits frontmatter
  via `src/lib/server/frontmatter.ts`, merges `{ ...frontmatter, body }`, and
  validates against the zod schema; `readJsonDir` does the JSON equivalent. A
  malformed file throws loudly with its path — never silently skipped.
- **Validator:** `validateDataDir` (`src/lib/server/validate-data.ts`) checks an
  entire data root — right directory, right extension, valid shape — and returns
  a list of problems. Run it two ways:
  - `pnpm test` validates the committed fixtures (`src/test/fixtures/`).
  - `pnpm validate:data` validates the live `data/` directory.
- A file in the wrong format for its directory (e.g. a stray `.json` in
  `decision-journal/`) is a validation failure, not a silent skip.
