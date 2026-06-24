# personal-trading-agent

A local, agent-driven swing-trading research-and-execution desk. Claude Code and Codex run scheduled routines that research the market, journal every decision, and (eventually) place trades through a broker MCP — viewed and controlled through a local Next.js dashboard.

> Not investment advice. Paper-trading first. See [`planning/`](./planning) for the full feasibility and architecture write-ups.

## Status

Planning complete. Phase 1 (dashboard + read-only research, paper-only) not yet scaffolded.

## Layout

```
planning/    Feasibility + architecture docs
src/         Next.js + Tailwind dashboard (the cockpit)
strategy/    Charter, playbook, rule files (the agent's constitution)
routines/    Scheduled prompt files + scheduler scripts
scripts/     Backup (rclone → R2), healthcheck, lockfile
data/        Journals, snapshots, chats — gitignored, backed up to R2 (encrypted)
```

## Key decisions

- **Goal:** swing trading, benchmark-relative vs. SPY, hard risk caps. Not a fixed weekly-return target.
- **Brokers:** Alpaca (paper → proving ground), Robinhood Agentic (optional live). Fidelity excluded.
- **LLM runtime:** Claude Code (Max plan) + Codex CLI (Pro) as harnesses — no metered API.
- **Stack:** Next.js + Tailwind, run natively on macOS (no Docker/DDEV).
- **Backups:** code/docs/strategy in git; secrets in Keychain; `data/` encrypted to Cloudflare R2.

## Setup

1. `cp .env.example .env` and fill in (keep real values out of git).
2. _Dashboard + routines: coming in Phase 1._
