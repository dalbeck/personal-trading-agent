#!/usr/bin/env bash
#
# start-server.sh — launch the always-on dashboard server under launchd
# supervision (KeepAlive: auto-restart on crash and at login/reboot).
#
# Runs the PRODUCTION Next server by default (`pnpm start`), so build first:
#   nvm use 22 && pnpm build
# Override the command via SERVER_CMD in .env (e.g. SERVER_CMD="pnpm dev").
#
# LOCAL ONLY. The server can read all accounts and (with both gates open) place
# trades — never expose it publicly. Bind localhost only.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# launchd starts with a minimal environment: put Homebrew + common bins on PATH
# and load Node via nvm so `node` / `pnpm` resolve the same as an interactive run.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
# shellcheck disable=SC1091
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 22 >/dev/null 2>&1 || true
fi

# Load .env (PORT, SERVER_CMD, tokens) — gitignored; launchd has no shell env.
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
export PORT="${PORT:-3000}"
# Production by default (matches the supervised dashboard service). `pnpm start`
# serves the build; set SERVER_CMD="pnpm dev" in .env to supervise dev instead.
export NODE_ENV="${NODE_ENV:-production}"

echo "Starting dashboard server on 127.0.0.1:${PORT} (cmd: ${SERVER_CMD:-pnpm start})…"
# Word-splitting of SERVER_CMD is intentional so "pnpm dev" / "pnpm start" work.
# shellcheck disable=SC2086
exec ${SERVER_CMD:-pnpm start}
