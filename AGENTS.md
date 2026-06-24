# AGENTS.md — Agent Routing & Operating Rules

This is the **single source of truth** for any AI agent (Claude Code, Codex, or other) working in this repository. `CLAUDE.md` is a symlink to this file — **edit `AGENTS.md` only.**

## How to use this file

AGENTS.md is a **router**, not a catch-all. It points to focused rule files in `.agents/`. Before starting work, read this file, then read the `.agents/` file(s) relevant to your task.

| File | Read it when you are… |
|------|------------------------|
| `.agents/infra.md` | Touching hosting, processes, secrets, backups, brokers, or the LLM runtime |
| `.agents/nextjs.md` | Writing or changing the dashboard (Next.js / Tailwind / TypeScript) |
| `.agents/design-system.md` | Building any UI — colors, type, spacing, components, accessibility |
| `.agents/workflow.md` | Doing git work, commits, branches, PRs, testing, or self-correcting |

Project background lives in `planning/` (`feasibility-and-plan.md`, `architecture.md`). Read those for the "why."

## Self-correction mandate (non-negotiable)

These agent docs are **living files**. You MUST keep them current as part of doing the work:

- When you hit an **error**, fix it *and* record the lesson — update the relevant `.agents/*.md` (or create a new one) so the same mistake is not repeated.
- When the project **pivots** (new tool, changed approach, abandoned idea, new convention), update the affected docs in the **same change** as the code.
- If a rule here is **wrong or outdated**, correct it rather than silently working around it.
- Prefer updating an existing file; create a new `.agents/<topic>.md` only when the topic is genuinely new — and add a row to the table above when you do.
- Stale instructions are treated as bugs. Never let the docs drift from reality.

## Hard rules (never violate)

1. **No co-authoring. Ever.** Commits and PRs must NOT include `Co-Authored-By`, "Co-authored-by: Claude/Codex", "Generated with…", a 🤖 footer, or any AI attribution. The human is the sole author of every commit and PR.
2. **No AI names in branches.** Branch names must never contain `claude`, `codex`, `gpt`, `ai`, `agent`, `bot`, or any model name. Use descriptive, human-style names (see `.agents/workflow.md`).
3. **Feature branches only.** All work happens on a feature branch off `main` and merges via PR. Never commit directly to `main`.
4. **Never commit secrets.** `.env` and `/data/` are gitignored — keep it that way. Secrets live in Keychain / 1Password.
5. **No real-money trades without the two-gate human approval** (see `.agents/infra.md`).

When in doubt, stop and ask the human rather than guessing on anything irreversible — money, deletes, permissions, or public posts.
