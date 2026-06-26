#!/usr/bin/env bash
# Generate launchd plists for the always-on SERVICES the unattended live desk
# needs, into ~/Library/LaunchAgents:
#
#   com.tradingdesk.dashboard — the dashboard server, KeepAlive (auto-restart on
#                             crash) + RunAtLoad (survives login/reboot). The
#                             scheduled routines POST to it, so it must stay up.
#                             This codifies the supervised dashboard service in
#                             the repo (reproducible) — same label, so it is
#                             idempotent with an existing hand-made one.
#   com.tradingdesk.backup  — the daily encrypted R2 backup of data/ (03:10 ET).
#
# Like install-routines.sh, this script ONLY WRITES the plists. It deliberately
# does NOT load them — you load them yourself, on purpose, once the server runs
# (`pnpm build` for production) and the R2 backup `.env` vars are set.
#
# Pair with install-routines.sh (the scheduled routines) for the full desk.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$ROOT/data/logs"
mkdir -p "$AGENTS" "$LOGS"

# Homebrew + common bins so launchd resolves node / pnpm / rclone.
LAUNCH_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

# --- Dashboard server: KeepAlive + RunAtLoad ---------------------------------
server_label="com.tradingdesk.dashboard"
cat >"$AGENTS/${server_label}.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${server_label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT}/scripts/start-server.sh</string>
  </array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${LAUNCH_PATH}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${LOGS}/launchd-server.out.log</string>
  <key>StandardErrorPath</key><string>${LOGS}/launchd-server.err.log</string>
</dict>
</plist>
EOF
echo "wrote $AGENTS/${server_label}.plist"

# --- Daily encrypted R2 backup: 03:10 every day ------------------------------
backup_label="com.tradingdesk.backup"
cat >"$AGENTS/${backup_label}.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${backup_label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${ROOT}/scripts/backup.sh</string>
  </array>
  <key>WorkingDirectory</key><string>${ROOT}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${LAUNCH_PATH}</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>3</integer>
    <key>Minute</key><integer>10</integer>
  </dict>
  <key>StandardOutPath</key><string>${LOGS}/launchd-backup.out.log</string>
  <key>StandardErrorPath</key><string>${LOGS}/launchd-backup.err.log</string>
</dict>
</plist>
EOF
echo "wrote $AGENTS/${backup_label}.plist"

cat <<EOF

Wrote 2 service plists to $AGENTS (NOT loaded).

Before loading:
  • Build the app for the production server:  nvm use 22 && pnpm build
    (or set SERVER_CMD="pnpm dev" in .env to run dev under supervision)
  • For the backup, set the R2 vars in .env (see scripts/README.md).

Load (start the server now + on every login; schedule the backup):
  launchctl bootstrap gui/\$(id -u) "$AGENTS/${server_label}.plist"
  launchctl bootstrap gui/\$(id -u) "$AGENTS/${backup_label}.plist"

Verify the server came up:
  launchctl print gui/\$(id -u)/${server_label} | grep -E 'state|pid'
  curl -fsS "http://127.0.0.1:\${PORT:-3000}/api/routines/x" -X POST -o /dev/null -w '%{http_code}\n'

Unload / stop:
  launchctl bootout gui/\$(id -u) "$AGENTS/${server_label}.plist"
  launchctl bootout gui/\$(id -u) "$AGENTS/${backup_label}.plist"

Run the backup once now (manual):
  scripts/backup.sh
EOF
