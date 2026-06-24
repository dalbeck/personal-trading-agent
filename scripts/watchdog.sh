#!/usr/bin/env bash
# Generic watchdog: keep a long-running command alive, restarting it on exit
# with capped exponential backoff. Used to supervise the optional news scout
# (M7) so a crash auto-restarts. Stop with Ctrl-C / SIGTERM.
#
#   scripts/watchdog.sh node scripts/news-scout.mjs
set -uo pipefail

[ "$#" -ge 1 ] || {
  echo "usage: watchdog.sh <command> [args...]" >&2
  exit 2
}

NAME="$(basename "$1")"
backoff=1
child=0

cleanup() {
  echo "watchdog: stopping ${NAME}"
  [ "$child" -ne 0 ] && kill "$child" 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

while true; do
  echo "watchdog: starting ${NAME}"
  start=$SECONDS
  "$@" &
  child=$!
  wait "$child"
  code=$?
  ran=$(( SECONDS - start ))
  # Reset backoff if it stayed up a healthy while; otherwise back off.
  if [ "$ran" -ge 60 ]; then backoff=1; fi
  echo "watchdog: ${NAME} exited (${code}) after ${ran}s; restarting in ${backoff}s"
  sleep "$backoff"
  backoff=$(( backoff < 30 ? backoff * 2 : 30 ))
done
