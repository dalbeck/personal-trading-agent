#!/usr/bin/env bash
#
# restore.sh — restore (decrypt) data/ from Cloudflare R2.
#
# Usage:
#   scripts/restore.sh                 # restore into ./data
#   scripts/restore.sh /tmp/scratch    # restore into a scratch dir (verify safely)
#   scripts/restore.sh --dry-run       # preview into ./data
#   scripts/restore.sh /tmp/scratch --dry-run
#
# Uses `copy` (not `sync`) so it never deletes files in the target.
# See scripts/README.md for setup.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/r2-common.sh
. "${SCRIPT_DIR}/r2-common.sh"

# First non-flag argument is the target dir; the rest pass through to rclone.
TARGET="${DATA_DIR}"
if [ "$#" -gt 0 ] && [ "${1#-}" = "$1" ]; then
  TARGET="$1"
  shift
fi

mkdir -p "${TARGET}"
echo "Restoring R2 (encrypted) → ${TARGET}…"
rclone copy "${REMOTE}:" "${TARGET}" \
  --transfers 8 \
  --checkers 16 \
  --stats-one-line \
  "$@"

echo "Restore complete → ${TARGET}"
