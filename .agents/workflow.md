# Workflow Rules

## Branching
- **All work on a feature branch off `main`.** Never commit to `main` directly.
- Branch naming: `type/short-kebab-description` — e.g. `feature/dashboard-overview`, `fix/alpaca-auth`, `chore/agent-docs`.
- **Never** put `claude`, `codex`, `gpt`, `ai`, `agent`, `bot`, or any model name in a branch name.
- Merge to `main` via PR.

## Commits & PRs
- **No co-authoring, no AI attribution — ever.** Do NOT add `Co-Authored-By:`, `Co-authored-by: Claude`, "Generated with Claude Code", a 🤖 footer, or any similar trailer to commits or PR descriptions. The human is the sole author.
- Commit messages: imperative, concise subject; body explains *why* when it isn't obvious.
- Keep commits scoped. Update `.agents/*.md` in the **same commit** as the related code/behavior change.

## Who runs git
- Git operations run **on the user's Mac** — their GitHub auth lives there, and the build sandbox cannot push and leaves `.git/*.lock` files it cannot clean up.
- Agents may prepare file changes; the user creates branches, commits, and pushes (or explicitly delegates specific git commands).
- If a `.git/*.lock` file appears, remove it on the Mac (e.g. `rm -f .git/index.lock`) before retrying.

## Verify before merge
- Build / typecheck / lint must pass. Test the affected views.
- For anything touching orders, money, permissions, or deletes: stop and get explicit human approval first.

## Self-correction (see AGENTS.md)
- On errors or direction changes, update or create the relevant `.agents/*.md` so the change is captured. Treat stale docs as bugs.
