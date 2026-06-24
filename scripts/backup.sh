#!/usr/bin/env bash
#
# backup.sh — encrypted backup of data/ to Cloudflare R2 via rclone crypt.
#
# Client-side encrypted (contents + filenames). Idempotent — safe to run on a
# daily cron/launchd schedule. Extra args pass through to rclone, e.g.:
#   scripts/backup.sh --dry-run
#   scripts/backup.sh --verbose
#
# See scripts/README.md for one-time setup (R2 bucket, .env vars).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/r2-common.sh
. "${SCRIPT_DIR}/r2-common.sh"

if [ ! -d "${DATA_DIR}" ]; then
  echo "Nothing to back up: ${DATA_DIR} does not exist." >&2
  exit 0
fi

echo "Backing up ${DATA_DIR} → R2 (encrypted)…"
# `sync` mirrors local → remote. --b2-hard-delete style not needed; crypt handles
# names. We keep it simple and let rclone skip unchanged objects (idempotent).
rclone sync "${DATA_DIR}" "${REMOTE}:" \
  --transfers 8 \
  --checkers 16 \
  --stats-one-line \
  "$@"

echo "Backup complete."
