#!/usr/bin/env bash
# Generate launchd plists for the scheduled routines into
# ~/Library/LaunchAgents, wired to this repo's run-routine.sh.
#
# This script ONLY WRITES the plists. It deliberately does NOT load them — you
# load them yourself, on purpose, once you have Alpaca paper credentials in
# .env and have reviewed the charter. Loading them starts the autonomous PAPER
# desk. (Still paper only; no real money anywhere in this phase.)
#
# Schedule (ET — assumes the Mac's clock is US/Eastern):
#   pre-market-research       Mon–Fri 08:00
#   market-open-execution     Mon–Fri 09:35
#   midday-scan               Mon–Fri 12:30
#   live-position-management  Mon–Fri 12:35  (read-only review of the LIVE book)
#   end-of-day-summary        Mon–Fri 16:15
#   weekly-review             Sun     17:00
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$ROOT/scripts/run-routine.sh"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS"

# routine|hour|minute|weekdays(space-separated; 0=Sun..6=Sat)
JOBS=(
  "pre-market-research|8|0|1 2 3 4 5"
  "market-open-execution|9|35|1 2 3 4 5"
  "midday-scan|12|30|1 2 3 4 5"
  "live-position-management|12|35|1 2 3 4 5"
  "end-of-day-summary|16|15|1 2 3 4 5"
  "weekly-review|17|0|0"
)

calendar_intervals() {
  local hour="$1" minute="$2" weekdays="$3" out=""
  for wd in $weekdays; do
    out+="    <dict>
      <key>Weekday</key><integer>${wd}</integer>
      <key>Hour</key><integer>${hour}</integer>
      <key>Minute</key><integer>${minute}</integer>
    </dict>
"
  done
  printf '%s' "$out"
}

for job in "${JOBS[@]}"; do
  IFS='|' read -r id hour minute weekdays <<<"$job"
  label="com.tradingdesk.${id}"
  plist="$AGENTS/${label}.plist"
  intervals="$(calendar_intervals "$hour" "$minute" "$weekdays")"
  cat >"$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${RUNNER}</string>
    <string>${id}</string>
  </array>
  <key>StartCalendarInterval</key>
  <array>
${intervals}  </array>
  <key>StandardOutPath</key><string>${ROOT}/data/logs/launchd-${id}.out.log</string>
  <key>StandardErrorPath</key><string>${ROOT}/data/logs/launchd-${id}.err.log</string>
</dict>
</plist>
EOF
  echo "wrote $plist"
done

cat <<EOF

Wrote ${#JOBS[@]} plists to $AGENTS (NOT loaded).

Before loading: ensure the dashboard server is running, Alpaca paper keys are in
.env, and you've reviewed strategy/charter.md.

Load a job (starts that schedule):
  launchctl bootstrap gui/\$(id -u) "$AGENTS/com.tradingdesk.pre-market-research.plist"

Unload / stop:
  launchctl bootout gui/\$(id -u) "$AGENTS/com.tradingdesk.pre-market-research.plist"

Run one immediately (manual, no schedule):
  scripts/run-routine.sh market-open-execution
EOF
