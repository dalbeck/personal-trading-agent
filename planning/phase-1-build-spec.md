# Phase 1 Build Spec — Local Dashboard (paper-only, read-only)

_Executable spec for a local Claude Code session running on the Mac. Read `AGENTS.md` and all `.agents/*.md` first — they are binding. This spec says **what** to build; the `.agents/` docs say **how** (stack, design tokens, git rules)._

## Outcome

A local **Next.js + Tailwind** dashboard that runs at `localhost`, themeable **light/dark**, showing trading research and (paper) account state by reading local files and the Alpaca **paper** API. **No order execution. No real money. No live Robinhood connection.** This phase proves the cockpit and the data plumbing only.

## Ground rules (from `.agents/`)

- **Stack:** Next.js (App Router) + TypeScript + **Tailwind only**. Use the installed Vercel Next.js skills. **Node 22** + **pnpm 11** — **never npm** (see "Toolchain & supply-chain security" below). Run natively; no Docker/DDEV.

### Toolchain & supply-chain security — pnpm 11
- **Node 22** pinned via `.nvmrc` (`22`) + `package.json` `engines`. Pin the package manager via Corepack: `"packageManager": "pnpm@11.x"`.
- **pnpm 11** (released Apr 2026) ships supply-chain defaults ON — keep them on:
  - `minimumReleaseAge: 1440` — ≥1-day cooldown so freshly-published (possibly compromised) versions aren't auto-adopted. May raise (e.g. `4320` = 3 days) for extra caution.
  - **Install/build scripts blocked by default** — allowlist only packages that genuinely need a native build via `allowBuilds` in `pnpm-workspace.yaml`. (The legacy `onlyBuiltDependencies` / `ignore-scripts` settings were removed in v11.)
  - `blockExoticSubdeps: true` — only direct deps may use git/tarball sources.
- **Frozen lockfile** everywhere: commit `pnpm-lock.yaml`; install with `pnpm install --frozen-lockfile` in CI and for reproducible local installs.
- Strict resolution via pnpm's symlinked store (no phantom deps). Run `pnpm audit` on install; fail on known criticals.
- **Design:** every color/spacing/radius/font comes from `.agents/design-system.md`. Implement tokens as CSS variables toggled by Tailwind's `dark` class. Inter font, `tabular-nums` on all numbers.
- **Git:** feature branch per milestone off `main`, PR to merge. No commit to `main`. **No AI attribution in commits/PRs. No AI/model names in branch names.** The `scripts/new-branch-commit.sh` helper enforces this.
- **Safety:** no code path that places a real-money order. Paper vs. live views must be clearly labeled and visually distinct (live is stubbed/empty this phase).
- **Self-correction:** if you hit an error or change an approach, update the relevant `.agents/*.md` in the same PR.

## Milestones (each = its own feature branch + PR)

### M1 — `feature/scaffold`
- `create-next-app` (App Router, TypeScript, Tailwind, ESLint) into `src/` (or repo root app dir — keep app code under a clear path; do not pollute `planning/`, `strategy/`, `routines/`, `scripts/`, `data/`).
- Global styles: define the full design-system token set as CSS variables for both themes; map them into Tailwind's theme. Load Inter.
- App shell: sidebar/nav, header with a **light/dark toggle** (persist choice in `localStorage` — theme only, never sensitive data), responsive layout using `h-dvh`.
- **Acceptance:** `npm run dev` serves the shell; theme toggles correctly; tokens visibly applied; `npm run build`, typecheck, and lint pass.

### M2 — `feature/data-contracts`
- Define TypeScript types for: `PortfolioSnapshot`, `Position`, `JournalEntry` (trade **and** rejection), `TradeProposal`, `CoachingEntry`.
- Create seed fixtures under `data/` (gitignored — that's fine; this is local sample data) representing a realistic paper book.
- Server-side `lib/` readers that load and validate these files. No client-side file access.
- **Acceptance:** typed, validated reads of all seed files; unit test or a simple script proves parsing.

### M3 — `feature/dashboard-views`
Build views, all reading seed data via the `lib/` layer:
- **Overview** — dual panels `PAPER` and `LIVE` (LIVE = empty/"not connected" placeholder this phase); total P&L, day P&L, equity-curve chart (a charting lib is fine — keep it light), vs-SPY benchmark line.
- **Positions** — sortable table; per-position qty, avg cost, last, unrealized P&L; `gain`/`loss` colors; `tabular-nums`.
- **Decision Journal** — reverse-chronological feed of trades and rejections with thesis/reasoning/review-date.
- **Proposals** — pending agent ideas with **Approve / Reject** buttons that update local state only (an `AlertDialog` confirm on Approve, with copy noting this is paper/no-op this phase).
- **Strategy** — render `strategy/charter.md` + `strategy/playbook.md`; allow editing and writing back to those files via a server action.
- **Routines** — list the five routines with last-run status + a "run now" button (stubbed this phase) and a dead-man-switch/health indicator placeholder.
- **Logs** — render recent run logs.
- **Acceptance:** all views render from seed data; responsive; keyboard-navigable; `aria-label` on icon-only buttons; visible focus rings; design system honored.

### M4 — `feature/alpaca-paper`
- Server-side `lib/alpaca.ts` calling the Alpaca **paper** REST API (`ALPACA_BASE_URL=https://paper-api.alpaca.markets`) using `.env` keys: account, positions, recent orders.
- Wire the `PAPER` panel + Positions to live paper data **with graceful fallback to seed data when keys are absent** (so the app always runs).
- Never expose keys to the client; all Alpaca calls are server-side.
- **Acceptance:** with valid paper keys in `.env`, PAPER panel and Positions show the real paper account; without keys, seed data renders and a non-blocking "using sample data" notice appears.

### M5 — `feature/chat-panel`
- API route (route handler) that spawns the local `claude` CLI (`claude -p …`) — and optionally `codex exec` — as a subprocess and **streams stdout to the browser via SSE**. Uses the host's Max/Codex subscriptions; **no metered API keys**.
- Client chat UI: prompt box, streaming response, model selector (Claude / Codex).
- Pass repo context (e.g., latest journal/snapshot paths) into the prompt so the chat is grounded.
- **Acceptance:** typing a question streams a response generated by the local CLI; no API key is used; errors surface inline.

### M6 — `feature/backups`
- `scripts/backup.sh`: `rclone` (with `crypt`) sync of `data/` → Cloudflare R2 using `.env` R2 vars; client-side encrypted. Idempotent; safe to cron daily.
- `scripts/restore.sh`: pull + decrypt `data/` back from R2.
- Document setup (rclone remote config, R2 bucket) in `.agents/infra.md` or a `scripts/README.md`.
- **Acceptance:** `backup.sh --dry-run` succeeds against a configured remote; restore documented and verified on a scratch dir.

## Out of scope for Phase 1 (do NOT build yet)
- Any real-money order placement or Robinhood MCP connection (Phase 3).
- The scheduled/autonomous trading loop and Codex red-team gate (Phase 2).
- The two-gate live permission flow (Phase 3).

## Definition of done
- All six milestones merged to `main` via PRs with clean, attribution-free commits.
- `npm run build` + lint + typecheck pass; app runs with and without `.env` keys.
- Screenshots of each view in both themes captured for review.
- Any deviations recorded in the relevant `.agents/*.md`.

## Prerequisites the human provides
- Node 22 on the Mac (pin via `.nvmrc`) with Corepack enabled; pnpm 11 (`corepack prepare pnpm@latest --activate` or `corepack enable`).
- (Optional, for M4) an Alpaca **paper** account + API keys in `.env`.
- (Optional, for M6) a Cloudflare R2 bucket + `rclone` installed and configured.
