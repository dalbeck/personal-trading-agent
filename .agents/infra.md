# Infrastructure Rules

## Hosting & processes
- Runs **natively on macOS**. No Docker, no DDEV. The dashboard backend must reach the host-authenticated `claude` and `codex` CLIs and the local filesystem directly — a container boundary would break that.
- Keep long-running processes alive with **pm2** or **launchd**, not a container.
- The dashboard is a **local** app (localhost). Never expose it publicly — it can read all accounts and (eventually) place trades.
- **Scheduled routines:** one launchd job per routine runs `scripts/run-routine.sh <id>`, which POSTs to `/api/routines/<id>` on the always-on dashboard server (the server runtime owns the lockfile, the code-gated execution pipeline, Alpaca paper, and the `codex` red-team). The endpoint runs under a single-instance lockfile and writes a `RunLog` to `data/logs/`. The trigger endpoint places paper orders, so it's gated by `ROUTINE_TRIGGER_TOKEN` (bearer) and must stay localhost-only. `scripts/install-routines.sh` writes the plists but never loads them — loading is a deliberate human act. **Execution is code-gated: every order clears the risk rails + red-team before Alpaca; the LLM proposes, it never executes.**
- **Reliability:** `src/lib/server/notify.ts` provides the dead-man switch (healthchecks.io per-routine slug pings on start/success/fail) and phone heartbeats (ntfy / Pushover) on routine start/finish and blocked orders. Both are **fail-soft** (an alert failure must never crash a routine) and **default off** (no env → no-op). `scripts/watchdog.sh` supervises the optional news scout, restarting it on crash with capped backoff.

## LLM runtime
- Agents run as **Claude Code (Max plan)** and **Codex CLI (Codex Pro)**, used as harnesses and invoked as subprocesses (`claude -p`, `codex exec`).
- **Do not** wire the app to metered LLM APIs for the agent runtime. The subscriptions are the runtime — that is a deliberate cost decision; keep it.
- **One sanctioned metered-API exception:** the optional **Perplexity `finance_search`** research provider (fundamentals / earnings / analyst / catalyst data). It is **default-off** (`RESEARCH_PROVIDER=off`), sits behind a swappable `ResearchProvider` interface, is **hard-capped per day** (`PERPLEXITY_DAILY_CALL_CAP`), and is used for **research only — never order pricing or execution** (Alpaca stays the source of truth for prices). This is Perplexity's pay-as-you-go **Agent API**, *not* the Pro app subscription. Key in `.env` (`PERPLEXITY_API_KEY`). Implemented in `src/lib/server/research/`: the daily cap is enforced **in code** (a persisted per-day counter in `data/research/`) before any request; only the pre-market routine calls it (via `/api/research/finance`); entries that used it are tagged `research:perplexity` for later evaluation.

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
