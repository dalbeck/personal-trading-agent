#!/usr/bin/env bash
#
# clear-seed-data.sh — remove sample/seed-flagged files from data/ so the
# dashboard shows its honest empty states.
#
# Only files explicitly marked sample (`"sample": true` in JSON, or
# `sample: true` in markdown frontmatter) are removed. Live records — which omit
# the marker or set it false — are left untouched. Safe and idempotent: running
# it twice removes nothing the second time.
#
# Allowlisted in the Operations panel as the `clear-seed-data` action
# (confirm-gated). See `src/lib/ops.ts` and `.agents/data-format.md`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${TRADING_DATA_DIR:-$ROOT/data}"

if [[ ! -d "$DATA_DIR" ]]; then
  echo "No data directory at $DATA_DIR — nothing to clear."
  exit 0
fi

removed=0

# Remove every file under $1 (matching the find filter) whose contents match the
# sample marker $2.
scan() {
  local dir="$1" pattern="$2"
  [[ -d "$dir" ]] || return 0
  local f
  while IFS= read -r -d '' f; do
    if grep -Eq "$pattern" "$f"; then
      echo "removing ${f#"$DATA_DIR"/}"
      rm -f "$f"
      removed=$((removed + 1))
    fi
  done < <(find "$dir" -type f \( -name '*.json' -o -name '*.md' \) -print0)
}

JSON_MARKER='"sample"[[:space:]]*:[[:space:]]*true'
MD_MARKER='^sample:[[:space:]]*true[[:space:]]*$'

# The spec's named cases: seed proposals and seed news.
scan "$DATA_DIR/proposals" "$JSON_MARKER"
scan "$DATA_DIR/news" "$JSON_MARKER"
# Future-proof: any other category that adopts the marker.
scan "$DATA_DIR/snapshots" "$JSON_MARKER"
scan "$DATA_DIR/logs" "$JSON_MARKER"
scan "$DATA_DIR/research" "$JSON_MARKER"
scan "$DATA_DIR/decision-journal" "$MD_MARKER"
scan "$DATA_DIR/coaching-log" "$MD_MARKER"

# Count the artifact files still in $DATA_DIR so the report is HONEST: clearing
# only sample-flagged files must never imply the panels are empty when unflagged
# (live/seed-without-marker) records are still being rendered. The runtime/safety
# dirs (locks/, control/) are excluded — they aren't desk artifacts. This mirrors
# the dir set that "Reset desk data" (reset-desk-data.sh) operates on.
ARTIFACT_DIRS=(
  snapshots decision-journal coaching-log chats
  proposals news fills logs research
)
remaining=0
for d in "${ARTIFACT_DIRS[@]}"; do
  dir="$DATA_DIR/$d"
  [[ -d "$dir" ]] || continue
  while IFS= read -r -d '' _; do
    remaining=$((remaining + 1))
  done < <(find "$dir" -type f \( -name '*.json' -o -name '*.md' \) -print0)
done

if [[ "$removed" -eq 0 ]]; then
  if [[ "$remaining" -eq 0 ]]; then
    echo "No sample-flagged files found in $DATA_DIR — nothing to clear."
  else
    echo "No sample-flagged files found in $DATA_DIR, but $remaining other file(s) remain."
    echo "These are not seed-flagged, so the panels still render them — use Reset desk data to clear everything."
  fi
else
  echo "Cleared $removed sample-flagged file(s) from $DATA_DIR."
  if [[ "$remaining" -gt 0 ]]; then
    echo "$remaining other (unflagged) file(s) remain — use Reset desk data to clear everything."
  fi
fi
