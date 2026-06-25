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
human's manual execution, kept in separate entries so the paper-desk evaluation
is never contaminated.

**Proposal `account` / `advisory` (live vs paper).** A `TradeProposal` carries
`account` (`paper` | `live`, default `paper`) and `advisory` (default `false`).
A **live-advisory** proposal (`account: "live"`, `advisory: true`) is read-only
guidance against the Robinhood Agentic account — the human executes it manually.
Its only terminal states are `reviewed` / `dismissed` (set via
`POST /api/proposals/review`); it is **never** routed to an order path (the
approval endpoint refuses it — see `.agents/infra.md`). The order/approval path
only ever writes `approved` / `rejected`.

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
  so the body is pure narrative.
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
