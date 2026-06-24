#!/usr/bin/env bash
# ONE-COMMAND KILL SWITCH (Phase 3 M6).
#
# Disables all trading in a single action:
#   1. Latches the live/trading HALT (disconnect) — forces LIVE TRADING OFF and
#      makes the routine pipeline refuse to trade. Written directly to the data
#      dir so it works even if the dashboard server is down.
#   2. Revokes the harness order permission in .claude/settings.json (the order
#      tools are removed from allow and forced into deny — a deny always wins).
#   3. Disconnects the read-only MCP for the running server (best-effort) and
#      unloads the scheduled-routine launchd jobs + stops the news scout.
#
# This is the deliberate human "stop everything" action. See
# planning/incident-runbook.md. Re-arming is a separate, deliberate step.
#
# Usage:  scripts/kill-switch.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
PORT="${PORT:-3000}"
STAMP="$(date -u +%FT%TZ)"

echo "== KILL SWITCH ENGAGING =="

# 1. Latch the halt directly (robust even if the server is down).
mkdir -p data/control
cat > data/control/live-halt.json <<EOF
{
  "haltedAt": "${STAMP}",
  "reason": "kill switch"
}
EOF
echo "[1/3] Trading HALT latched (data/control/live-halt.json)."

# …and ask the running server to disconnect too (best-effort).
curl -fsS -X POST "http://localhost:${PORT}/api/live/disconnect" \
  -H 'content-type: application/json' -d '{"action":"disconnect"}' >/dev/null 2>&1 \
  && echo "      Dashboard disconnect acknowledged." \
  || echo "      (server not reachable — file halt already in effect.)"

# 2. Revoke the harness order permission (close the harness gate).
if node scripts/revoke-order-permission.mjs; then
  echo "[2/3] Harness order permission revoked."
else
  echo "[2/3] WARNING: could not edit .claude/settings.json — revoke it by hand."
fi

# 3. Unload scheduled routines + stop the news scout watchdog.
unloaded=0
for plist in "$HOME"/Library/LaunchAgents/com.tradingdesk.*.plist; do
  [ -e "$plist" ] || continue
  launchctl bootout "gui/$(id -u)" "$plist" >/dev/null 2>&1 || \
    launchctl unload "$plist" >/dev/null 2>&1 || true
  unloaded=$((unloaded + 1))
done
pkill -f "scripts/watchdog.sh" >/dev/null 2>&1 || true
pkill -f "scripts/news-scout.sh" >/dev/null 2>&1 || true
echo "[3/3] Unloaded ${unloaded} routine job(s); stopped the news scout."

echo
echo "== KILL SWITCH ENGAGED =="
echo "Live trading is OFF, order permission revoked, routines halted."
echo "Verify on the dashboard (LIVE TRADING: OFF · disconnected) and review"
echo "planning/incident-runbook.md before re-arming."
