# Next.js / Frontend Rules

## Stack
- **Next.js (App Router) + TypeScript + Tailwind CSS.** Tailwind is the only styling framework — no CSS-in-JS libraries and no other UI kits unless added here first.
- Use the installed **Vercel Next.js skills** when scaffolding and for framework conventions.
- Run natively: `next dev` for development; pm2/launchd for always-on.

## Toolchain & supply-chain security
- **Node 22**, pinned via `.nvmrc` + `package.json` `engines`. **Package manager: pnpm 11** (never npm), pinned via Corepack `"packageManager": "pnpm@11.x"`.
- Keep pnpm 11's supply-chain defaults ON, configured in `pnpm-workspace.yaml`:
  - `minimumReleaseAge: 1440` (≥1-day cooldown; may raise to `4320`).
  - **Build scripts blocked by default** — allowlist real native builds via `allowBuilds`.
  - `blockExoticSubdeps: true` (only direct deps may use git/tarball sources).
- **Frozen lockfile** on every install; commit `pnpm-lock.yaml`. Run `pnpm audit` on install; fail on known criticals.
- Strict resolution (pnpm symlinked store = no phantom deps).
- **Pin deps whose `@types` lag the runtime.** `pnpm add js-yaml` resolves the new **5.x** major, but the only published types are `@types/js-yaml@4.0.9` (for v4), so v5 typechecks wrong. We pin **`js-yaml@4.1.0`** (mature, types-matched, exports `JSON_SCHEMA`). Check `@types` coverage before accepting a fresh major.

## Scaffold lessons (M1 — learned, do not relearn)
- **Node in PATH vs. the pin.** `node`/`npm` are nvm shell functions, but the default binary on PATH is **Homebrew Node 25**, so `pnpm`/`next` run under 25 unless you switch. Always run dev/build/lint/typecheck under Node 22: `nvm use 22` first (pnpm otherwise warns `Unsupported engine`). The pin lives in `.nvmrc` (`22`) + `engines.node`.
- **Corepack signature bug.** The Corepack bundled with Node 22.13.1 fails pnpm 11 activation with `Cannot find matching keyid` (stale signing keys). Fix once: `npm i -g corepack@latest` (bootstrap only — this is the one sanctioned `npm` use), then `corepack prepare pnpm@latest --activate`. Active pnpm: **11.9.0**.
- **`allowBuilds` needs explicit decisions.** pnpm 11.9 treats *undecided* blocked build scripts as a **fatal** error in the pre-run deps check, so `pnpm <script>` fails until every such package is set `true`/`false` in `pnpm-workspace.yaml`. `sharp` and `unrs-resolver` are set **`false`** (both ship prebuilt binaries; no native build needed). Flip to `true` only with a one-line justification.
- **Stack versions:** Next 16 (App Router, Turbopack) + React 19 + **Tailwind v4** + ESLint 9 flat config. App is rooted at the **repo root** with `--src-dir` (code in `src/`, config at root); `pnpm-workspace.yaml` holds the supply-chain settings.

## Structure
- Server Components by default for data fetching (file reads, Alpaca REST).
- Client Components only where interactivity or streaming is needed (chat, approvals, live updates).
- Route handlers / API routes own: file I/O on the repo, Alpaca calls, spawning `claude`/`codex` subprocesses, and streaming their stdout to the browser via SSE.
- Keep broker / LLM / file logic in a server-side `lib/` layer, not in components.
- **Risk engine (`src/lib/risk/`):** pure, side-effect-free validators that hard-gate every proposed order against the charter. They cannot be bypassed by prompt — enforcement is in code. Never hardcode a limit; import `RISK_LIMITS` from `@strategy/charter.config`. That config is the machine-readable mirror of `strategy/charter.md` and **must stay in lockstep** — change a number in both (plus the charter change log) in the same edit; `charter-config.test.ts` is the tripwire. The `@strategy/*` path alias is set in both `tsconfig.json` and `vitest.config.ts`.
- **External API responses are untrusted:** zod-validate them server-side too (see `lib/server/alpaca.ts`). Live data views resolve through a resolver that prefers the live source but **falls back to seed data with a non-blocking notice** when keys are absent or the call fails — the app must always render (`lib/server/account.ts`).
- **Symbol detail view (`/symbol/[ticker]`):** Alpaca is the source for the chart bars, quote snapshot, and news (`getStockBars`/`getStockSnapshot`/`getStockNews` in `alpaca.ts`); the resolver/mapping/range logic is in `lib/server/symbol.ts` and degrades to the link-outs (Yahoo/Robinhood/Stocktwits) with a clear notice when keys are absent or a call fails — **never fabricate a chart/quote**. Free Alpaca accounts get the **IEX** feed (`feed=iex`, set via `ALPACA_DATA_FEED`), which is not the consolidated SIP tape — label it honestly in the UI. Shared symbol constants/types (ranges, the view contract, the symbol regex) live in the **plain** `lib/symbol.ts` so the client price chart can import them without tripping the `server-only` rule. Display / research only — never order pricing or execution.
- **Never import a `server-only` module from a client component** — it throws at build. Put shared constants/types in a plain module (e.g. `lib/chat.ts`) and keep spawning/fs/secrets in the `server-only` sibling (`lib/server/chat.ts`).
- **CLI subprocesses:** stream stdout to the browser via SSE from a `runtime = "nodejs"` route handler (`app/api/chat`). Spawn with argv (no shell) so prompts can't inject; `codex exec` reads stdin, so close it (`child.stdin.end()`) or it hangs. `claude -p` in the repo cwd has file-read tools, which is intended (grounded chat) — keep prompts read-only, never grant order/trade tools.
- **Red-team gate (`src/lib/server/red-team.ts`):** spawns `codex exec` (a *different model family*) as a hostile prosecutor that defaults to "no". The spawn is injectable (`opts.exec`) so prompt/parse/policy are unit-tested without the CLI. It **fails closed** — if the prosecutor errors or its output is unparseable, the verdict is `reject`. Never change it to fail open.

## UI
- All visual decisions come from `.agents/design-system.md`. Do not hardcode colors, spacing, radii, or fonts — use the design tokens.
- Support **light and dark** mode (Tailwind `dark` class + CSS variables).
  - Tailwind v4: enable class-based dark with `@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`; map design tokens to CSS vars that swap under `.dark`, exposed to utilities via `@theme inline`. Avoid token names that collide with Tailwind keywords (use `surface`, not `base` — `text-base` is a font size).
  - Theme is applied **pre-paint** by an inline script in the root layout (reads `localStorage` then OS preference); add `suppressHydrationWarning` to `<html>` because that script mutates its class before hydration.
  - Client components that read DOM/theme state must use `useSyncExternalStore`, **not** `setState` in `useEffect` — Next 16's `react-hooks/set-state-in-effect` rule fails lint otherwise.
- Accessibility is mandatory: `aria-label` on icon-only buttons, visible focus, `AlertDialog` for destructive/irreversible actions (enabling live trading, approving a live order).

## Markdown rendering (dynamic LLM content)
- Render **all dynamic / LLM-generated markdown** (chat output, journal theses, coaching notes) through the shared `Markdown` component (`src/components/markdown.tsx`). Never hand-roll a parser and never feed this content to **MDX** — rendering untrusted MDX executes arbitrary JS. MDX is only for trusted, statically-authored docs.
- The input is **untrusted**. The pipeline order is load-bearing: `remark-gfm` → `rehype-raw` → `rehype-sanitize` (GitHub schema) → `rehype-highlight`. Sanitize runs on the raw-parsed tree so it strips `<script>`/`<iframe>`, `on*` handlers, and `javascript:` URLs; highlight runs *after* sanitize so its `hljs` spans are trusted output and survive. The sanitize schema is extended only to keep `className` on `<code>` (the `language-*` hint highlight needs) — do not widen it further without a recorded reason.
- Links open via a custom `a` renderer with `target="_blank" rel="noopener noreferrer"`. Tables use `tabular-nums`. Syntax-highlight colors are mapped to design tokens in `globals.css` (`.hljs-*`), not a third-party theme — so code reads correctly in both themes.
- Streaming is handled implicitly: the chat panel re-renders `Markdown` as tokens arrive; partial/unclosed markdown renders best-effort without crashing.
- Coverage lives in `src/components/markdown.test.ts` (rendered with `react-dom/server`, no jsdom) — it pins GFM rendering, link safety, and that injection payloads are stripped. Extend it, don't bypass it.

## Account view mode (Paper | Live) — M1
- A global **Paper | Live** toggle (`src/components/mode-toggle.tsx`, in the header) picks which **book** the panels display. It is a **view switch, not an engine switch**: both desks always run; toggling never arms trading. It is intentionally **separate** from the LIVE TRADING gate chip (`live-status.tsx`) so the view preference is never confused with the execution gate.
- **Persistence = a cookie, not localStorage.** Theme is a client-only CSS class so it uses localStorage + a pre-paint script; the view mode changes **server-rendered data**, so it lives in the `view-mode` cookie that the server reads (`getViewMode()` in `src/lib/server/mode.ts`). Server components render the correct book on first paint — no flash, no `data-mode` attribute needed. The client toggle writes the cookie and calls `router.refresh()`. Pure constants/helpers (`parseViewMode`, `otherMode`, `VIEW_MODE_COOKIE`) live in the plain `src/lib/mode.ts` so client + server can both import them; `parseViewMode` defaults anything that isn't exactly `"live"` to `paper` (the safe default).
- **Ownership-driven vs behavior-driven panels.** Portfolio surfaces switch book with the mode: Overview hero KPIs + equity curve, Positions (active book primary, the other shown as a compact indicator), Proposals (filtered by `account`). **Behavior-driven** panels stay paper-desk-scoped regardless of mode and say so: Evaluation (the live view shows a **paper-only-gate note**, never the paper score — `src/components/mode-scope.tsx` `DeskScopeNote` + the `EvalSnapshotModule` `mode` prop), the Decision Journal (the desk's own record), guardrails, routine health. News watches the paper book only until M2, and the live view is honest about that gap. Symbol detail is market/research data — mode-independent. **Label scope on every panel** (`ViewingBadge`).
- **Safety:** Live view exposes no execution control — live proposals stay advisory ("execute manually"), the order gate stays closed. Toggling to Live cannot enable trading.

## Tracked universe + auto-surfacing — M2
- The **tracked universe** = the active book's holdings (auto) + the editable manual **watchlist** (`data/control/watchlist.json`). Pure helpers in `src/lib/universe.ts` (`buildUniverse`, `classifyOwnership`, `dedupeSymbols`); server assembly in `src/lib/server/universe.ts` — `getTrackedUniverse(mode)` for the active-book pages, `getScoutSymbols()` for the **global** scout/research universe (both books' holdings + watchlist, so live holdings are watched — the previously-flagged gap). The news scout poll route uses `getScoutSymbols()`.
- **Watchlist editing** goes through `/api/watchlist` (GET + add/remove POST) — a local data-state mutation only (no broker/order path), validated server-side. The `WatchlistEditor` client writes through it and `router.refresh()`es so the universe-driven views update.
- **Auto-surfacing:** an owned/watched symbol gets a Held/Watchlist badge (`OwnershipBadge` in `mode-scope.tsx`) on News items, the Overview activity feed, and the symbol detail header; News is filtered to the active book's universe. Symbol price/news data stays mode-independent (market data); only the ownership tag is mode-scoped.
- **Manual live trades → coaching:** the Coaching page is mode-aware (paper desk vs. the human's manual live trades). "Sync live trades" (`/api/live/sync-trades` → `syncLiveTrades`) ingests filled Robinhood orders **read-only** into the journal as `account: "live"`, `manual: true`; the Journal/Coaching pages scope by `account` and badge manual live trades. See `.agents/infra.md` for the read-only order-history surface.

## Autonomous discovery — M3
- The pre-market routine (`routines/pre-market-research.md`) is the discovery engine: it scans sources (the scout's `data/news/`, Alpaca per-symbol news, the routine's own web search if available, and the capped default-off Perplexity provider) **plus** the tracked universe to surface **new** buy/sell proposals (not only on holdings). It runs only when routines run (launchd / Operations) — nothing auto-runs.
- **Bounded in code, not just by prompt:** `DISCOVERY_LIMITS` (charter, tripwired) caps new proposals per run (`maxNewProposalsPerRun`, = the daily order cap; pure helper `discoveryProposalBudget`) and the watchlist size (`maxWatchlistSymbols`, enforced in `addDiscoveredToWatchlist`). Proposals still clear the risk rails + the red-team gate; the research per-day cap still applies.
- **Auto-populate the watchlist** (95/5 automation): discovery POSTs candidates to `/api/watchlist/discover` (token-gated, tracking-only — no broker/order path), which adds them as `source: "discovery"` entries up to the cap. The watchlist editor badges them `auto`; the human prunes.
- **Live discovery is advisory-only with no execution path** — a discovered live idea is written `account: "live"`, `advisory: true`; `isAdvisoryProposal` is true so the single execution entry (`/api/live/approve`) refuses it (422). Unit-tested in `discovery-advisory.test.ts`. Auto-generated proposals are **review candidates, never auto-acted** — the human approves every trade.

## Safety in the UI
- The dashboard surfaces trade approvals; it must **never bypass** the two-gate permission flow for real-money orders (see `.agents/infra.md`).
- Paper and live account views must be clearly labeled and visually distinct.

## Server-side command execution
The backend may spawn local processes (the `claude`/`codex` CLIs, repo scripts) — that's intended (native macOS, no container). But any **HTTP-triggered** execution MUST be:
- **Allowlisted** — fixed action IDs → specific binaries/scripts + fixed args. Never run a client-supplied path, name, or args.
- **Shell-free** — `execFile`/`spawn` with an args array and `shell: false`. No `exec` / string concatenation (command-injection risk).
- **Token-gated + localhost-only** — same bearer-token pattern as the routine trigger; bound to 127.0.0.1.
- **Confirm-gated** for destructive/system-changing actions (`AlertDialog`).
- **Never** expose, via any button or endpoint, an action that **opens the live-trading gate** or funds/moves real money. The dashboard may close/kill, never open the live gate.
- **"Run now" (Routines page)** triggers a routine from the UI via a **server action** (`src/app/routines/actions.ts` `triggerRoutine`) that POSTs to the existing **token-gated** `/api/routines/<id>` with `ROUTINE_TRIGGER_TOKEN` injected **server-side** — the token is never exposed to the browser and the real execution stays behind the same gate `scripts/run-routine.sh`/launchd use. Allowlisted (id validated against `ROUTINE_CATALOG`), localhost-only, fire-and-forget (a routine spawns `claude -p` for minutes; the RunLog records the result). Order-placing routines (`routinePlacesOrders`, i.e. `market-open-execution`) are **confirm-gated** (AlertDialog) before triggering, and place **paper** orders only — this never touches the closed live gate.
