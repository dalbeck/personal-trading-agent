# Infrastructure Rules

## Hosting & processes
- Runs **natively on macOS**. No Docker, no DDEV. The dashboard backend must reach the host-authenticated `claude` and `codex` CLIs and the local filesystem directly — a container boundary would break that.
- Keep long-running processes alive with **pm2** or **launchd**, not a container.
- The dashboard is a **local** app (localhost). Never expose it publicly — it can read all accounts and (eventually) place trades.

## LLM runtime
- Agents run as **Claude Code (Max plan)** and **Codex CLI (Codex Pro)**, used as harnesses and invoked as subprocesses (`claude -p`, `codex exec`).
- **Do not** wire the app to metered LLM APIs. The subscriptions are the runtime — that is a deliberate cost decision; keep it.

## Brokers
- **Alpaca** = paper trading and the default build/proving ground for all development.
- **Robinhood Agentic** = optional live execution (Phase 3 only), via its MCP (`https://agent.robinhood.com/mcp/trading`).
- **Fidelity** = excluded; no retail automation API.
- **Two-gate live safety:** (1) the Robinhood Agentic account allows agent trading; (2) a one-time human `settings.json` allow-list edit enables order tools. An agent may **never** grant itself order permission. Per-trade approval stays ON until paper results justify otherwise.

## Secrets
- `.env` is gitignored. Real values live in macOS Keychain / 1Password. Keep `.env.example` current.
- Never print secrets to logs, journals, or the dashboard.

## Data & backups (three tiers)
1. **Code + docs + strategy** → private git remote (`origin`).
2. **Secrets** → never in git; Keychain / 1Password.
3. **`data/`** (journals, snapshots, chats) → **Cloudflare R2, client-side encrypted via `rclone crypt`**, gitignored. Daily job lives in `scripts/` (`backup.sh` / `restore.sh`; setup in `scripts/README.md`). The scripts build the rclone config from `.env` env vars at runtime — **no secrets in any rclone config file**; crypt password/salt live in `.env` (`R2_CRYPT_PASSWORD` / `R2_CRYPT_SALT`).
- Never live-symlink the working tree into Google Drive (it corrupts `.git`). Back up snapshots, not the live tree.

## Repo layout
`planning/` · `src/` (dashboard) · `strategy/` (charter, playbook, rules) · `routines/` (prompt files + scheduler) · `scripts/` (backup, healthcheck, lockfile) · `data/` (gitignored, R2-backed)
