#!/usr/bin/env bash
#
# preflight.sh — one-shot readiness check before the evaluation window.
#
# Prints a PASS / WARN / FAIL line per check and a summary, then exits non-zero
# if ANY check FAILed. The point is to catch a silent misconfiguration BEFORE
# you spend weeks of paper-trading on a desk that was never actually wired up.
#
#   scripts/preflight.sh              # readiness check (no side effects beyond
#                                     #   creating missing data/ subdirs)
#   scripts/preflight.sh --shakedown  # also fire pre-market-research end-to-end
#                                     #   and report the artifacts it wrote
#
# macOS / BSD `date` and `launchctl` are assumed (the desk runs natively on the
# Mac — see .agents/infra.md). Paper only; this never touches real money.

# NOT `set -e`: we want every check to run and aggregate, not bail on the first
# non-zero. `-u`/pipefail still catch real bugs in the script itself.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SHAKEDOWN=0
if [ "${1:-}" = "--shakedown" ]; then
  SHAKEDOWN=1
elif [ -n "${1:-}" ]; then
  echo "usage: preflight.sh [--shakedown]" >&2
  exit 2
fi

# --- output helpers -----------------------------------------------------------
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_RED=$'\033[31m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
else
  C_RESET=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_BOLD=""; C_DIM=""
fi

passes=0; warns=0; fails=0

pass() { printf '  %sPASS%s  %s\n' "$C_GREEN" "$C_RESET" "$1"; passes=$((passes + 1)); }
warn() { printf '  %sWARN%s  %s\n' "$C_YELLOW" "$C_RESET" "$1"; warns=$((warns + 1)); }
fail() { printf '  %sFAIL%s  %s\n' "$C_RED" "$C_RESET" "$1"; fails=$((fails + 1)); }
info() { printf '        %s%s%s\n' "$C_DIM" "$1" "$C_RESET"; }
section() { printf '\n%s%s%s\n' "$C_BOLD" "$1" "$C_RESET"; }

# --- load .env (launchd has no shell env; the runtime reads it the same way) ---
ENV_FILE="$ROOT/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ENV_FILE"
  set +a
fi

PORT="${PORT:-3000}"
BASE_URL="http://127.0.0.1:${PORT}"

printf '%s== Trading desk preflight ==%s  (%s)\n' "$C_BOLD" "$C_RESET" "$ROOT"

# --- 1. .env + Alpaca vars ----------------------------------------------------
section "1. Environment (.env + Alpaca keys)"
if [ ! -f "$ENV_FILE" ]; then
  fail ".env not found at $ENV_FILE — copy .env.example to .env and fill it in."
else
  pass ".env present."
  for v in ALPACA_API_KEY_ID ALPACA_API_SECRET_KEY ALPACA_BASE_URL; do
    if [ -z "${!v:-}" ]; then
      fail "$v is not set in .env (exact name required)."
    else
      pass "$v is set."
    fi
  done

  if [ -n "${ALPACA_BASE_URL:-}" ] && [[ "$ALPACA_BASE_URL" != *paper* ]]; then
    warn "ALPACA_BASE_URL is not the paper endpoint ($ALPACA_BASE_URL). This app is paper-only — expected https://paper-api.alpaca.markets."
  fi

  # Common mix-up: Alpaca's SDK uses APCA_* env names; this app uses ALPACA_*.
  if [ -n "${APCA_API_KEY_ID:-}" ] || [ -n "${APCA_API_SECRET_KEY:-}" ]; then
    warn "APCA_API_KEY_ID/APCA_API_SECRET_KEY are present — that's Alpaca's SDK naming. This app reads ALPACA_API_KEY_ID/ALPACA_API_SECRET_KEY; make sure those are the ones filled in."
  fi
fi

# --- 2. Alpaca connectivity ---------------------------------------------------
section "2. Alpaca connectivity (paper account)"
if [ -z "${ALPACA_API_KEY_ID:-}" ] || [ -z "${ALPACA_API_SECRET_KEY:-}" ] || [ -z "${ALPACA_BASE_URL:-}" ]; then
  fail "Skipped — Alpaca vars missing (see check 1)."
elif ! command -v curl >/dev/null 2>&1; then
  fail "curl not found — cannot reach Alpaca."
else
  # HTTP header names (APCA-API-*) differ from the env var names (ALPACA_*).
  resp="$(curl -sS -m 15 -w $'\n%{http_code}' \
    -H "APCA-API-KEY-ID: ${ALPACA_API_KEY_ID}" \
    -H "APCA-API-SECRET-KEY: ${ALPACA_API_SECRET_KEY}" \
    "${ALPACA_BASE_URL%/}/v2/account" 2>/dev/null)"
  code="$(printf '%s' "$resp" | tail -n1)"
  body="$(printf '%s' "$resp" | sed '$d')"

  if [ "$code" = "200" ]; then
    equity="$(printf '%s' "$body" | grep -oE '"equity":"[0-9.]+"' | head -1 | grep -oE '[0-9.]+')"
    buying="$(printf '%s' "$body" | grep -oE '"buying_power":"[0-9.]+"' | head -1 | grep -oE '[0-9.]+')"
    acct_status="$(printf '%s' "$body" | grep -oE '"status":"[A-Z_]+"' | head -1 | sed -E 's/.*:"([A-Z_]+)"/\1/')"
    pass "Authenticated to Alpaca (account ${acct_status:-?}). Equity: \$${equity:-?} · Buying power: \$${buying:-?}."
    if [[ "$ALPACA_BASE_URL" != *paper* ]]; then
      warn "Authenticated, but ALPACA_BASE_URL is not the paper endpoint — verify this is intentional (paper-only app)."
    fi
  elif [ "$code" = "401" ] || [ "$code" = "403" ]; then
    fail "Alpaca auth failed (HTTP $code). Check ALPACA_API_KEY_ID/ALPACA_API_SECRET_KEY match the paper keys at the base URL."
  elif [ -z "$code" ]; then
    fail "Could not reach Alpaca at ${ALPACA_BASE_URL} (no response). Check the URL and your network."
  else
    fail "Alpaca returned HTTP $code. ${body:0:160}"
  fi
fi

# --- 3. Dashboard server ------------------------------------------------------
section "3. Dashboard server"
srv_code="$(curl -sS -m 5 -o /dev/null -w '%{http_code}' "$BASE_URL" 2>/dev/null || true)"
if [ -n "$srv_code" ] && [ "$srv_code" != "000" ]; then
  pass "Dashboard reachable at $BASE_URL (HTTP $srv_code). Routine triggers POST here."
  SERVER_UP=1
else
  warn "Dashboard not reachable at $BASE_URL. Start it before triggering routines: 'nvm use 22 && pnpm dev' (or the launchd/pm2 service)."
  SERVER_UP=0
fi

# --- 4. Trigger token ---------------------------------------------------------
section "4. Routine trigger token"
if [ -n "${ROUTINE_TRIGGER_TOKEN:-}" ]; then
  pass "ROUTINE_TRIGGER_TOKEN is set."
  info "The RUNNING server must share the same token. If you changed .env, restart the dashboard server so it picks up the new value."
else
  warn "ROUTINE_TRIGGER_TOKEN is not set — the routine trigger endpoint is unauthenticated. Set it ('openssl rand -hex 32') so a stray localhost page can't fire paper trades, then restart the server."
fi

# --- 5. data/ writable + subdirs ---------------------------------------------
section "5. data/ directory"
DATA_DIR="$ROOT/data"
mkdir -p "$DATA_DIR" 2>/dev/null || true
if [ ! -d "$DATA_DIR" ] || [ ! -w "$DATA_DIR" ]; then
  fail "data/ is not writable at $DATA_DIR."
else
  probe="$DATA_DIR/.preflight-write-test"
  if ( : > "$probe" ) 2>/dev/null; then
    rm -f "$probe"
    pass "data/ is writable."
  else
    fail "data/ exists but is not writable."
  fi
  created=""
  for sub in snapshots decision-journal coaching-log logs proposals research; do
    if [ ! -d "$DATA_DIR/$sub" ]; then
      mkdir -p "$DATA_DIR/$sub" && created="$created $sub"
    fi
  done
  if [ -n "$created" ]; then
    pass "Expected subdirs present (created:${created})."
  else
    pass "Expected subdirs present (snapshots, decision-journal, coaching-log, logs, proposals, research)."
  fi
fi

# --- 6. launchd routines & services -------------------------------------------
section "6. launchd routines & services"
AGENTS_DIR="$HOME/Library/LaunchAgents"
shopt -s nullglob
plists=("$AGENTS_DIR"/com.tradingdesk.*.plist)
shopt -u nullglob
if [ "${#plists[@]}" -eq 0 ]; then
  warn "No com.tradingdesk.*.plist found in $AGENTS_DIR. Generate them with 'scripts/install-routines.sh' (writes plists; does not load)."
else
  loaded_list=""
  if command -v launchctl >/dev/null 2>&1; then
    loaded_list="$(launchctl list 2>/dev/null | grep -E 'com\.tradingdesk\.' || true)"
  fi
  loaded_count=0
  for plist in "${plists[@]}"; do
    label="$(basename "$plist" .plist)"
    if printf '%s\n' "$loaded_list" | grep -q "$label"; then
      info "loaded:     $label"
      loaded_count=$((loaded_count + 1))
    else
      info "not loaded: $label"
    fi
  done
  if [ "$loaded_count" -eq 0 ]; then
    warn "${#plists[@]} routine plist(s) present but NONE are loaded — the desk won't run on a schedule. Load with 'launchctl bootstrap gui/\$(id -u) <plist>'."
  else
    pass "$loaded_count of ${#plists[@]} plist(s) loaded."
  fi
fi

# Always-on SERVICES (M4): the supervised dashboard server (KeepAlive) and the
# scheduled daily backup. Written by install-services.sh; loaded deliberately.
for svc in "com.tradingdesk.dashboard:supervised dashboard server (KeepAlive)" \
           "com.tradingdesk.backup:daily encrypted R2 backup"; do
  svc_label="${svc%%:*}"
  svc_desc="${svc#*:}"
  if [ ! -f "$AGENTS_DIR/${svc_label}.plist" ]; then
    warn "No ${svc_label}.plist — ${svc_desc} not installed. Generate with 'scripts/install-services.sh' (writes; does not load)."
  elif printf '%s\n' "${loaded_list:-}" | grep -q "${svc_label}"; then
    pass "${svc_desc} loaded (${svc_label})."
  else
    warn "${svc_label}.plist present but not loaded — ${svc_desc} won't run. Load with 'launchctl bootstrap gui/\$(id -u) <plist>'."
  fi
done

# --- 7. Notifications / dead-man switch ---------------------------------------
section "7. Notifications & dead-man switch"
notify_on=0
[ -n "${NOTIFY_PROVIDER:-}" ] && [ "${NOTIFY_PROVIDER}" != "off" ] && notify_on=1
hc_on=0
[ -n "${HEALTHCHECKS_PING_KEY:-}" ] && hc_on=1
if [ "$notify_on" -eq 0 ] && [ "$hc_on" -eq 0 ]; then
  warn "No phone heartbeats (NOTIFY_PROVIDER=off) and no dead-man switch (HEALTHCHECKS_PING_KEY unset) — a silent failure during the window would go unnoticed. Both are optional but recommended."
else
  [ "$notify_on" -eq 1 ] && pass "Phone heartbeats on (NOTIFY_PROVIDER=${NOTIFY_PROVIDER})." || info "Phone heartbeats off (NOTIFY_PROVIDER=off)."
  [ "$hc_on" -eq 1 ] && pass "Dead-man switch on (HEALTHCHECKS_PING_KEY set)." || info "Dead-man switch off (HEALTHCHECKS_PING_KEY unset)."
fi

# --- 8. Charter ---------------------------------------------------------------
section "8. Charter"
if [ ! -f "$ROOT/strategy/charter.md" ]; then
  fail "strategy/charter.md is missing."
else
  pass "strategy/charter.md present."
fi
CHARTER_CFG="$ROOT/strategy/charter.config.ts"
if [ ! -f "$CHARTER_CFG" ]; then
  fail "strategy/charter.config.ts (machine-readable charter) is missing."
elif ! grep -q "RISK_LIMITS" "$CHARTER_CFG"; then
  fail "strategy/charter.config.ts does not export RISK_LIMITS — the risk engine reads this. Verify it parses."
else
  pass "strategy/charter.config.ts present and exports RISK_LIMITS."
fi

# --- 9. Timezone & next fire times -------------------------------------------
section "9. Timezone & schedule"
tz_abbr="$(date +%Z)"
tz_off="$(date +%z)"
info "Mac clock: $(date '+%Y-%m-%d %H:%M:%S') ${tz_abbr} (UTC${tz_off})"
if [[ "$tz_abbr" == E[SD]T ]] || [ "$tz_off" = "-0400" ] || [ "$tz_off" = "-0500" ]; then
  pass "Clock is US/Eastern (${tz_abbr}) — routine schedules are ET."
else
  warn "Mac clock is ${tz_abbr} (UTC${tz_off}), not US/Eastern. Routine schedules assume an ET clock; fire times below are in local time."
fi

# Same cadence as install-routines.sh (id|hour|minute|weekdays 0=Sun..6=Sat).
ROUTINE_SCHEDULE=(
  "pre-market-research|8|0|1 2 3 4 5"
  "market-open-execution|9|35|1 2 3 4 5"
  "midday-scan|12|30|1 2 3 4 5"
  "end-of-day-summary|16|15|1 2 3 4 5"
  "weekly-review|17|0|0"
)

# Next fire time for a (hour, minute, weekdays) schedule, in local time.
# BSD `date` (`-v` add, `-j -f` parse) — macOS only.
next_fire() {
  local hour="$1" minute="$2" weekdays="$3"
  local now_epoch; now_epoch="$(date +%s)"
  local i
  for i in $(seq 0 8); do
    local d wd
    d="$(date -v+"${i}"d +%Y-%m-%d 2>/dev/null)" || return 1
    wd="$(date -v+"${i}"d +%w 2>/dev/null)"
    if printf ' %s ' "$weekdays" | grep -q " $wd "; then
      local cand cand_epoch
      cand="$(printf '%s %02d:%02d' "$d" "$hour" "$minute")"
      cand_epoch="$(date -j -f '%Y-%m-%d %H:%M' "$cand" +%s 2>/dev/null)"
      if [ -n "$cand_epoch" ] && [ "$cand_epoch" -gt "$now_epoch" ]; then
        printf '%s' "$cand"
        return 0
      fi
    fi
  done
  return 1
}

for row in "${ROUTINE_SCHEDULE[@]}"; do
  IFS='|' read -r id hour minute weekdays <<<"$row"
  nf="$(next_fire "$hour" "$minute" "$weekdays" || true)"
  info "$(printf '%-22s next: %s' "$id" "${nf:-?}")"
done

# --- shakedown: end-to-end propose → gates → journal --------------------------
if [ "$SHAKEDOWN" -eq 1 ]; then
  section "Shakedown — pre-market-research (end-to-end)"
  if [ "${SERVER_UP:-0}" -ne 1 ]; then
    fail "Cannot shake down — the dashboard server is not running (see check 3). Start it and retry with --shakedown."
  else
    LOGS_DIR="$DATA_DIR/logs"
    PROP_DIR="$DATA_DIR/proposals"
    JRNL_DIR="$DATA_DIR/decision-journal"
    start_marker="$DATA_DIR/.preflight-shakedown-start"
    : > "$start_marker"

    info "Triggering scripts/run-routine.sh pre-market-research (this can take a minute — it spawns 'claude -p')…"
    if run_out="$(scripts/run-routine.sh pre-market-research 2>&1)"; then
      pass "Routine trigger returned successfully."
    else
      fail "Routine trigger failed: ${run_out:0:200}"
    fi

    # Echo the engine's own summary line if the response is JSON.
    summary="$(printf '%s' "$run_out" | grep -oE '"summary":"[^"]*"' | head -1 | sed -E 's/"summary":"(.*)"/\1/')"
    [ -n "$summary" ] && info "Engine summary: $summary"

    # A fresh run log written after we dropped the marker?
    new_log="$(find "$LOGS_DIR" -name '*.json' -type f -newer "$start_marker" 2>/dev/null | head -1)"
    if [ -n "$new_log" ]; then
      pass "Fresh run log written: ${new_log#"$ROOT"/}"
    else
      fail "No new run log appeared in data/logs/ after the trigger — the run may not have completed."
    fi

    new_props="$(find "$PROP_DIR" -name '*.json' -type f -newer "$start_marker" 2>/dev/null | wc -l | tr -d ' ')"
    new_jrnl="$(find "$JRNL_DIR" -name '*.md' -type f -newer "$start_marker" 2>/dev/null | wc -l | tr -d ' ')"
    rejections="$(printf '%s' "$run_out" | grep -oE '"rejections":[0-9]+' | head -1 | grep -oE '[0-9]+')"
    info "Artifacts written this run — proposals: ${new_props:-0} · journal entries: ${new_jrnl:-0} · rejections: ${rejections:-0}"
    info "This proves the propose → gates → journal path end-to-end before you rely on the schedule."

    rm -f "$start_marker"
  fi
fi

# --- summary ------------------------------------------------------------------
printf '\n%s== Summary ==%s  %sPASS %d%s · %sWARN %d%s · %sFAIL %d%s\n' \
  "$C_BOLD" "$C_RESET" \
  "$C_GREEN" "$passes" "$C_RESET" \
  "$C_YELLOW" "$warns" "$C_RESET" \
  "$C_RED" "$fails" "$C_RESET"

if [ "$fails" -gt 0 ]; then
  printf '%sNot ready — resolve the FAIL(s) above before starting the window.%s\n' "$C_RED" "$C_RESET"
  exit 1
fi
if [ "$warns" -gt 0 ]; then
  printf '%sReady with warnings — review the WARN(s) above.%s\n' "$C_YELLOW" "$C_RESET"
else
  printf '%sReady.%s\n' "$C_GREEN" "$C_RESET"
fi
exit 0
