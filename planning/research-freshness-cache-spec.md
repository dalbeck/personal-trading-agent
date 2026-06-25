# Build Spec — research freshness cache + manual refresh + Robinhood VIX

_Executable spec for a local Claude Code session. Read `AGENTS.md`,
`.agents/infra.md`, `.agents/data-format.md`, `.agents/nextjs.md`,
`.agents/design-system.md`, `strategy/charter.md` first. One branch:
`feature/research-freshness-cache` (stacked on `feature/approval-real-risk-context`
until M1 merges, because it edits `market-conditions.ts`)._

## Why

The desk already persists every expensive AI/metered payload to disk in `data/`
(which survives restart **and** rebuild — it is on-disk, gitignored, R2-backed):
symbol research + the AI summary are cached per-symbol-per-day
(`data/research/cache/`), and red-team verdicts live on the proposal. So a
restart does **not** re-spend tokens today. The real gaps:

1. **Day-boundary expiry** — the research cache key includes the calendar date,
   so crossing midnight ET re-spends a metered Perplexity call even when nothing
   changed. Wrong for a swing desk holding for days.
2. **Freshness is invisible and there is no manual refresh** — you cannot see how
   old cached data is, or choose when to re-spend.

We extend the existing **file-cache** pattern (no database — single-user, local,
low-volume; structured payloads stay JSON per `.agents/data-format.md`). We add a
visible `fetchedAt` + `source`, manual refresh, a soft max-age safety cap, and a
free Robinhood VIX signal for the emergency-stop rail.

## Unit 1 — Robinhood VIX market signal (server-only)

Wire a **free** live VIX into the M1 emergency-stop rail (the Alpaca stock feed
has no `^VIX`).

- `robinhood.ts`: add `get_index_quotes` to a **symbol/index-scoped**
  `MARKET_DATA_TOOLS` allow-list (mirrors `get_equity_fundamentals` — references
  **no account**; `get_accounts` + every order tool stay in `FORBIDDEN_TOOLS`).
  Add `buildVixCliCommand` (pure, unit-tested for the safety invariants) and
  `getRobinhoodVix(): Promise<number | null>` via the host `claude` CLI (argv,
  shell-free), gated on `hasRobinhoodConnection()`, best-effort.
- `market-conditions.ts`: the default `vix` getter resolves to `getRobinhoodVix`,
  behind a **short-TTL on-disk cache** (`data/control/market-conditions.json`,
  `{ vix, fetchedAt }`, default TTL ~10 min) so the slow CLI spawn does not block
  every approval. VIX is a live signal → **time-TTL, not manual refresh**.
  Still **fail-soft to the neutral reading** (trips no rail) on any miss.
- **Acceptance:** `buildVixCliCommand` allow-lists only `get_index_quotes`, no
  account, every order/`get_accounts` tool disallowed (unit-tested); the TTL
  cache serves within the window and refetches after; a fetch failure degrades to
  neutral; the rail fires when VIX>30 is returned (already covered by M1's
  injected-market test, now exercised through the real default path with a seam).

## Unit 2 — Research cache freshness + manual refresh (server + UI)

- **Re-key** the research cache `<date>-<SYMBOL>.json` → `<SYMBOL>.json`, carrying
  `fetchedAt` (ISO) and the existing `source`. Bump `CACHE_VERSION`. Old dated
  files are harmless orphans (gitignored); note them for a later cleanup, do not
  read them.
- **Expiry policy (manual + soft safety cap):** `getSymbolResearch` serves the
  cached payload **unless** it is older than `RESEARCH_MAX_AGE` (default **7 days**
  → auto-refetch) **or** `force` is set (manual refresh always refetches). A
  separate `RESEARCH_STALE_AGE` (default **2 days**) is **display-only** — a
  stale color/label, never an auto-spend. Both overridable via env.
- The **Perplexity daily cap** (`PERPLEXITY_DAILY_CALL_CAP`) still gates every
  refetch (manual or auto), so refresh can never blow the budget — a capped
  refresh returns the existing cache + a `capped` status.
- `getSymbolResearch(symbol, { force?, now? })`; new
  `POST /api/symbol/[ticker]/research/refresh` (local, force-refetch one symbol).
- **UI** (`.agents/design-system.md` + safe `Markdown`): the research card shows
  **"fetched N ago · <source>"**, a stale flag past `RESEARCH_STALE_AGE`, and a
  **Refresh** button (disabled + reason when the daily cap is hit).
- **Acceptance:** fresh → served from cache (no spend); older than max-age →
  auto-refetch; `force` → refetch even when fresh; capped → no spend, cache
  served, status surfaced; freshness label + stale flag render (screenshot).

## Unit 3 — Proposals surface + red-team re-run (same branch)

- Each proposal card surfaces its **linked symbol's research freshness** + a
  Refresh action (reuses Unit 2's endpoint/logic).
- **Re-run red-team:** `POST /api/proposals/[id]/red-team` re-runs the prosecutor
  for one proposal **regardless of an existing verdict** (re-spends one ~10s codex
  call) and overwrites the stored verdict via `setProposalRedTeam`.
  **Confirm-gated** in the UI because it costs. Red-team is otherwise still cached
  on the proposal (the sweep skips judged proposals — unchanged).
- **Acceptance:** the re-run overwrites the verdict (tested with an injected
  exec); the endpoint is confirm-gated; proposal cards show the linked symbol's
  freshness (screenshot).

## Cross-cutting

- New/changed control + cache files are **internal state files** (written
  directly, best-effort, malformed = miss), not `data/` artifact contracts —
  document them in `.agents/data-format.md`. Update `.agents/infra.md` for the
  Robinhood `get_index_quotes` market-data tool and the VIX TTL cache.
- Verify: `pnpm test`, `pnpm typecheck`, `pnpm lint` green; screenshots of the
  freshness UI + refresh + red-team re-run before merge.

## Out of scope

- A database / SQLite (explicitly rejected — files fit single-user/local/low-vol).
- Changing how prices are sourced (Alpaca stays price-of-record; VIX is a
  market-condition signal, not an order price).
- Caching chat (ephemeral by design).
