#!/usr/bin/env bash
#
# reset-desk-data.sh — clear ALL desk artifacts from the app's data directory so
# every dashboard panel falls back to its honest empty state.
#
# Unlike clear-seed-data.sh (which removes only `sample: true`-flagged files),
# this removes every artifact file regardless of the sample marker. It is the
# "start from a clean desk" action and is destructive — it deletes live journal,
# coaching, snapshot, proposal, news, log, and research records.
#
# It operates on the SAME directory the running app reads from: the resolved
# DATA_DIR, honoring TRADING_DATA_DIR exactly like src/lib/server/data.ts. It is
# never hardcoded to ./data, so it cannot silently clear the wrong place.
#
# Safety: the runtime/control directories are deliberately NOT touched —
#   - locks/    holds the single-instance routine lockfile
#   - control/  holds the live-trading HALT latch and the funding tracker
# wiping those would corrupt running state or drop a safety latch.
#
# The directories themselves are kept; only their files are removed. Idempotent.
#
# Allowlisted in the Operations panel as the confirm-gated `reset-desk-data`
# action. See src/lib/ops.ts and .agents/data-format.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${TRADING_DATA_DIR:-$ROOT/data}"

echo "Resetting desk data under $DATA_DIR"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "No data directory at $DATA_DIR — nothing to reset."
  exit 0
fi

# The desk artifact directories rendered by the dashboard panels. Runtime/safety
# dirs (locks/, control/) are intentionally excluded — see the header.
ARTIFACT_DIRS=(
  snapshots
  decision-journal
  coaching-log
  chats
  proposals
  news
  fills
  logs
  research
)

removed=0

# Remove every artifact file (*.json / *.md) under $1, keeping the directory.
clear_dir() {
  local dir="$DATA_DIR/$1"
  [[ -d "$dir" ]] || return 0
  local f
  while IFS= read -r -d '' f; do
    echo "removing ${f#"$DATA_DIR"/}"
    rm -f "$f"
    removed=$((removed + 1))
  done < <(find "$dir" -type f \( -name '*.json' -o -name '*.md' \) -print0)
}

for d in "${ARTIFACT_DIRS[@]}"; do
  clear_dir "$d"
done

if [[ "$removed" -eq 0 ]]; then
  echo "No desk artifacts found in $DATA_DIR — already clean."
else
  echo "Reset complete: removed $removed desk artifact file(s) from $DATA_DIR."
fi
