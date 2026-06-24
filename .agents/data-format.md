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
| `data/proposals/` | `.json` | `TradeProposalSchema` |
| `data/fills/` | `.json` | _(added in Phase 2)_ |
| `data/logs/` | `.json` | `RunLogSchema` (one per routine run) |
| `data/research/` | `.json` | `ResearchUsageSchema` (per-day metered-API call counter) |

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
