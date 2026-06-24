#!/usr/bin/env bash
#
# r2-common.sh — shared setup for the R2 backup/restore scripts.
# Sourced by backup.sh and restore.sh; not meant to be run directly.
#
# Builds an rclone config entirely from environment variables (.env), so no
# secrets are ever written to an rclone config file on disk. Defines two remotes:
#   ptar2     — Cloudflare R2 (S3-compatible) bucket
#   ptacrypt  — a `crypt` wrapper over ptar2:<bucket>/data (client-side encryption)
# and exports REMOTE=ptacrypt for the callers to use.

set -euo pipefail

# Resolve repo root from this script's location (scripts/ is at the repo root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA_DIR="${REPO_ROOT}/data"

# --- Load .env (gitignored; the user's real values) ---
if [ -f "${REPO_ROOT}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${REPO_ROOT}/.env"
  set +a
else
  echo "Error: ${REPO_ROOT}/.env not found. Copy .env.example to .env and fill in the R2 vars." >&2
  exit 1
fi

# --- Prerequisite: rclone ---
if ! command -v rclone >/dev/null 2>&1; then
  echo "Error: rclone is not installed. Install it with:  brew install rclone" >&2
  echo "Then configure the R2 bucket + .env vars (see scripts/README.md)." >&2
  exit 1
fi

# --- Required env vars ---
require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Error: ${name} is not set in .env (see scripts/README.md)." >&2
    exit 1
  fi
}
require_var R2_ACCOUNT_ID
require_var R2_ACCESS_KEY_ID
require_var R2_SECRET_ACCESS_KEY
require_var R2_BUCKET
require_var R2_CRYPT_PASSWORD
require_var R2_CRYPT_SALT

# --- rclone config via environment (no on-disk config, no plaintext secrets) ---
# Base S3 remote pointing at Cloudflare R2.
export RCLONE_CONFIG_PTAR2_TYPE="s3"
export RCLONE_CONFIG_PTAR2_PROVIDER="Cloudflare"
export RCLONE_CONFIG_PTAR2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
export RCLONE_CONFIG_PTAR2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
export RCLONE_CONFIG_PTAR2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
export RCLONE_CONFIG_PTAR2_REGION="auto"
export RCLONE_CONFIG_PTAR2_ACL="private"

# Crypt wrapper: client-side encrypts file contents AND names under bucket/data.
# rclone needs obscured passwords; obscure the plaintext from .env at runtime.
export RCLONE_CONFIG_PTACRYPT_TYPE="crypt"
export RCLONE_CONFIG_PTACRYPT_REMOTE="ptar2:${R2_BUCKET}/data"
RCLONE_CONFIG_PTACRYPT_PASSWORD="$(rclone obscure "${R2_CRYPT_PASSWORD}")"
RCLONE_CONFIG_PTACRYPT_PASSWORD2="$(rclone obscure "${R2_CRYPT_SALT}")"
export RCLONE_CONFIG_PTACRYPT_PASSWORD RCLONE_CONFIG_PTACRYPT_PASSWORD2
export RCLONE_CONFIG_PTACRYPT_FILENAME_ENCRYPTION="standard"
export RCLONE_CONFIG_PTACRYPT_DIRECTORY_NAME_ENCRYPTION="true"

# The remote the callers operate on.
REMOTE="ptacrypt"
export REMOTE DATA_DIR
