#!/usr/bin/env bash
# Trigger a single routine on the local engine. Used by the launchd jobs and
# for manual runs:  scripts/run-routine.sh market-open-execution
#
# Paper only. POSTs to the always-on dashboard server, which runs the routine
# under a single-instance lock. Never expose that server publicly.
set -euo pipefail

ROUTINE="${1:?usage: run-routine.sh <routine-id>}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load PORT / ROUTINE_TRIGGER_TOKEN from .env if present (launchd has no shell env).
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

PORT="${PORT:-3000}"
URL="http://127.0.0.1:${PORT}/api/routines/${ROUTINE}"

AUTH=()
if [ -n "${ROUTINE_TRIGGER_TOKEN:-}" ]; then
  AUTH=(-H "Authorization: Bearer ${ROUTINE_TRIGGER_TOKEN}")
fi

# -f: fail (non-zero) on HTTP error so launchd/healthchecks see failures.
exec curl -fsS --max-time 900 -X POST "${AUTH[@]}" "$URL"
