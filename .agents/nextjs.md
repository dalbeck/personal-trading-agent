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

## Structure
- Server Components by default for data fetching (file reads, Alpaca REST).
- Client Components only where interactivity or streaming is needed (chat, approvals, live updates).
- Route handlers / API routes own: file I/O on the repo, Alpaca calls, spawning `claude`/`codex` subprocesses, and streaming their stdout to the browser via SSE.
- Keep broker / LLM / file logic in a server-side `lib/` layer, not in components.

## UI
- All visual decisions come from `.agents/design-system.md`. Do not hardcode colors, spacing, radii, or fonts — use the design tokens.
- Support **light and dark** mode (Tailwind `dark` class + CSS variables).
- Accessibility is mandatory: `aria-label` on icon-only buttons, visible focus, `AlertDialog` for destructive/irreversible actions (enabling live trading, approving a live order).

## Safety in the UI
- The dashboard surfaces trade approvals; it must **never bypass** the two-gate permission flow for real-money orders (see `.agents/infra.md`).
- Paper and live account views must be clearly labeled and visually distinct.
