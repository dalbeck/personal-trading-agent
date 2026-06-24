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
- **External API responses are untrusted:** zod-validate them server-side too (see `lib/server/alpaca.ts`). Live data views resolve through a resolver that prefers the live source but **falls back to seed data with a non-blocking notice** when keys are absent or the call fails — the app must always render (`lib/server/account.ts`).
- **Never import a `server-only` module from a client component** — it throws at build. Put shared constants/types in a plain module (e.g. `lib/chat.ts`) and keep spawning/fs/secrets in the `server-only` sibling (`lib/server/chat.ts`).
- **CLI subprocesses:** stream stdout to the browser via SSE from a `runtime = "nodejs"` route handler (`app/api/chat`). Spawn with argv (no shell) so prompts can't inject; `codex exec` reads stdin, so close it (`child.stdin.end()`) or it hangs. `claude -p` in the repo cwd has file-read tools, which is intended (grounded chat) — keep prompts read-only, never grant order/trade tools.

## UI
- All visual decisions come from `.agents/design-system.md`. Do not hardcode colors, spacing, radii, or fonts — use the design tokens.
- Support **light and dark** mode (Tailwind `dark` class + CSS variables).
  - Tailwind v4: enable class-based dark with `@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`; map design tokens to CSS vars that swap under `.dark`, exposed to utilities via `@theme inline`. Avoid token names that collide with Tailwind keywords (use `surface`, not `base` — `text-base` is a font size).
  - Theme is applied **pre-paint** by an inline script in the root layout (reads `localStorage` then OS preference); add `suppressHydrationWarning` to `<html>` because that script mutates its class before hydration.
  - Client components that read DOM/theme state must use `useSyncExternalStore`, **not** `setState` in `useEffect` — Next 16's `react-hooks/set-state-in-effect` rule fails lint otherwise.
- Accessibility is mandatory: `aria-label` on icon-only buttons, visible focus, `AlertDialog` for destructive/irreversible actions (enabling live trading, approving a live order).

## Safety in the UI
- The dashboard surfaces trade approvals; it must **never bypass** the two-gate permission flow for real-money orders (see `.agents/infra.md`).
- Paper and live account views must be clearly labeled and visually distinct.
