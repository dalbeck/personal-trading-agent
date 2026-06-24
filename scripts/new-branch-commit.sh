#!/usr/bin/env bash
#
# new-branch-commit.sh — wrap working-tree changes into a feature branch, commit, push, and open a PR.
#
# Usage:
#   scripts/new-branch-commit.sh <branch-name> "<commit message>"
#
# Example:
#   scripts/new-branch-commit.sh feature/dashboard-overview "Add overview page with dual account panels"
#
# Enforces the repo rules (see AGENTS.md / .agents/workflow.md):
#   - NO AI attribution: this script never adds Co-Authored-By, "Generated with…", or any AI footer.
#   - NO AI/model names in branch names (claude, codex, gpt, ai, agent, bot, …).
#   - Feature-branch workflow: never commits directly to main.
#
set -euo pipefail

REPO_SLUG="dalbeck/personal-trading-agent"

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <branch-name> \"<commit message>\"" >&2
  exit 1
fi

BRANCH="$1"; shift
MSG="$*"

# --- Guard: forbidden AI/model references in branch name ---
lower="$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]')"
if printf '%s' "$lower" | grep -qE 'claude|codex|gpt|gemini|copilot|llama|anthropic|openai'; then
  echo "Refusing: branch name '$BRANCH' references an AI tool/model." >&2
  exit 1
fi
IFS='/_-.' read -ra _parts <<< "$lower"
for p in "${_parts[@]}"; do
  case "$p" in
    ai|agent|agents|bot|bots|ml|llm)
      echo "Refusing: branch name '$BRANCH' contains the forbidden token '$p'." >&2
      exit 1 ;;
  esac
done

# --- Guard: never target main/master ---
if [ "$lower" = "main" ] || [ "$lower" = "master" ]; then
  echo "Refusing: work must go on a feature branch, not '$BRANCH'." >&2
  exit 1
fi

# --- Clear any stale git locks (harmless if absent) ---
rm -f .git/index.lock .git/HEAD.lock .git/objects/maintenance.lock 2>/dev/null || true

# --- Create the feature branch from current HEAD (carries working-tree changes) ---
git switch -c "$BRANCH"

# --- Stage everything (respects .gitignore) ---
git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit on '$BRANCH'." >&2
  exit 1
fi

# --- Commit: plain message, no co-authoring / no AI attribution ---
git commit -m "$MSG"

# --- Push and set upstream ---
git push -u origin "$BRANCH"

# --- Open a PR if the GitHub CLI is available; otherwise print the compare URL ---
if command -v gh >/dev/null 2>&1; then
  gh pr create --base main --head "$BRANCH" --fill \
    || echo "Pushed. Open a PR: https://github.com/${REPO_SLUG}/compare/${BRANCH}?expand=1"
else
  echo "Pushed. Open a PR: https://github.com/${REPO_SLUG}/compare/${BRANCH}?expand=1"
fi

echo "Done."
