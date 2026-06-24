#!/usr/bin/env bash
# Always-on news scout: poll the local scout endpoint on an interval. Each poll
# fetches the RSS feeds, triages headlines against the paper book, and persists
# material items to data/news/. Supervise it so a crash auto-restarts:
#
#   scripts/watchdog.sh scripts/news-scout.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi

PORT="${PORT:-3000}"
INTERVAL="${NEWS_SCOUT_INTERVAL:-300}"
URL="http://127.0.0.1:${PORT}/api/news-scout/poll"

AUTH=()
if [ -n "${ROUTINE_TRIGGER_TOKEN:-}" ]; then
  AUTH=(-H "Authorization: Bearer ${ROUTINE_TRIGGER_TOKEN}")
fi

echo "news-scout: polling ${URL} every ${INTERVAL}s"
while true; do
  curl -fsS --max-time 60 -X POST "${AUTH[@]}" "$URL" \
    || echo "news-scout: poll failed (server down?)"
  echo
  sleep "$INTERVAL"
done
