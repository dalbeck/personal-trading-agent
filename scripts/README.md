# Scripts

Helper scripts for the trading agent: the **preflight readiness check**, the
**scheduled routines** (launchd) and the encrypted `data/` backups.

## Preflight readiness check

`preflight.sh` is a one-shot check you run **before** starting the evaluation
window, so you don't burn weeks of paper trading on a silently misconfigured
desk. It prints a `PASS` / `WARN` / `FAIL` line per check and a summary, and
**exits non-zero if any check FAILs** (so it can gate a launch script).

```bash
scripts/preflight.sh              # readiness check
scripts/preflight.sh --shakedown  # also fire pre-market-research end-to-end
```

What it checks:

1. **`.env` + Alpaca vars** — `.env` exists and `ALPACA_API_KEY_ID`,
   `ALPACA_API_SECRET_KEY`, `ALPACA_BASE_URL` are set (exact names). WARNs if the
   base URL isn't the paper endpoint, or if the SDK-style `APCA_*` names are
   present (a common mix-up — this app reads `ALPACA_*`).
2. **Alpaca connectivity** — authenticates `GET ${ALPACA_BASE_URL}/v2/account`
   (HTTP headers `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY`) and prints the
   account status, equity, and buying power. **FAILs** on an auth error.
3. **Dashboard server** — reachable at `http://127.0.0.1:${PORT:-3000}`? WARNs
   with start instructions if it's down (routine triggers POST there).
4. **Trigger token** — reminds you that the running server must share
   `ROUTINE_TRIGGER_TOKEN`; WARNs (unauthenticated trigger) if it's unset.
5. **`data/` writable** — ensures `data/` is writable and creates any missing
   subdirs (`snapshots`, `decision-journal`, `coaching-log`, `logs`,
   `proposals`, `research`).
6. **launchd** — lists which `com.tradingdesk.*.plist` exist and which are
   loaded; WARNs if none are loaded (the desk won't run on a schedule).
7. **Notifications** — WARNs if both phone heartbeats (`NOTIFY_PROVIDER`) and the
   dead-man switch (`HEALTHCHECKS_PING_KEY`) are off (a silent failure during the
   window would go unnoticed).
8. **Charter** — `strategy/charter.md` and `strategy/charter.config.ts` are
   present and the config exports `RISK_LIMITS`.
9. **Timezone** — prints the Mac clock + timezone (routine schedules assume
   US/Eastern) and the next fire time for each routine.

`--shakedown` additionally triggers `run-routine.sh pre-market-research` against
the running server, confirms a fresh run log landed in `data/logs/`, and reports
the proposals / journal entries / rejections that run wrote — proving the
propose → gates → journal path end-to-end before you rely on the schedule.
(Requires the dashboard server to be up.)

macOS only — it uses BSD `date` and `launchctl`.

## Scheduled routines (launchd)

The five routines (see `routines/`) run on a schedule. A launchd job per routine
runs `run-routine.sh <id>`, which POSTs to `http://127.0.0.1:$PORT/api/routines/<id>`
on the always-on dashboard server. The endpoint runs the routine under a
single-instance **lockfile** and writes a structured run log to `data/logs/`
(surfaced on the Routines + Logs views).

- `run-routine.sh <id>` — trigger one routine (used by launchd; also for manual
  runs). Sources `.env` for `PORT` / `ROUTINE_TRIGGER_TOKEN`.
- `install-routines.sh` — generate the five plists into `~/Library/LaunchAgents`
  with this repo's path + the ET cadence. **It does not load them** — you load
  them deliberately once Alpaca paper keys are set and the charter is reviewed.

```bash
scripts/install-routines.sh                 # writes plists (not loaded)
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.tradingdesk.pre-market-research.plist
scripts/run-routine.sh market-open-execution  # run one now, manually
```

**Safety:** the trigger endpoint places paper orders. Set `ROUTINE_TRIGGER_TOKEN`
in `.env` so only the runner (which sends the bearer token) can fire it. Never
expose the dashboard server publicly. **Execution is code-gated** — every
proposal clears the risk rails and the red-team before Alpaca paper is called;
the LLM proposes but never executes.

### Reliability (M6)

The trigger endpoint emits two kinds of alerts (both **fail-soft** and default
**off** — see `src/lib/server/notify.ts`):

- **Dead-man switch** — each routine pings healthchecks.io on start / success /
  fail (`HEALTHCHECKS_PING_KEY`). A *missed or stalled* run trips healthchecks on
  its own channel, so a silent failure still alerts.
- **Phone heartbeat** — ntfy or Pushover (`NOTIFY_PROVIDER`) on routine
  start/finish and on **any blocked order**.

`watchdog.sh <command>` keeps a long-running process (the optional M7 news
scout) alive, restarting it with capped backoff if it dies:

```bash
scripts/watchdog.sh node scripts/news-scout.mjs   # restarts the scout on crash
```

## Encrypted `data/` backups → Cloudflare R2

`data/` (journals, snapshots, chats) is **gitignored** and backed up to
Cloudflare R2, **client-side encrypted** via `rclone crypt` — contents *and*
filenames are encrypted before they leave the machine. R2 only ever sees
ciphertext.

- `backup.sh` — mirror `data/` → R2 (idempotent; safe to cron daily).
- `restore.sh` — pull + decrypt R2 → `data/` (or a scratch dir).
- `r2-common.sh` — shared setup, sourced by both (not run directly).

No secrets are written to an rclone config file: the scripts build the rclone
config from environment variables in `.env` at runtime.

### One-time setup

1. **Install rclone**

   ```sh
   brew install rclone
   ```

2. **Create the R2 bucket + API token** (Cloudflare dashboard → R2)
   - Create a bucket, e.g. `personal-trading-agent-data`.
   - Create an R2 **API token** (Object Read & Write) → note the Access Key ID
     and Secret Access Key, and your Account ID.

3. **Pick a crypt password + salt** (these encrypt the data — store them in
   1Password/Keychain and **never lose or change them**; without the exact pair
   you cannot decrypt your backups). Generate two strong random values:

   ```sh
   openssl rand -base64 24   # → R2_CRYPT_PASSWORD
   openssl rand -base64 24   # → R2_CRYPT_SALT
   ```

   (Any strong strings work — the scripts run them through `rclone obscure` at
   runtime, so put the plaintext in `.env`.)

4. **Fill in `.env`** (copy from `.env.example`):

   ```sh
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=personal-trading-agent-data
   R2_CRYPT_PASSWORD=...
   R2_CRYPT_SALT=...
   ```

### Usage

```sh
scripts/backup.sh --dry-run     # preview what would upload (no changes)
scripts/backup.sh               # encrypt + upload data/ → R2
scripts/restore.sh /tmp/scratch # decrypt R2 → a scratch dir (verify safely)
scripts/restore.sh              # decrypt R2 → ./data
```

The scripts fail fast with a clear message if rclone or any required `.env`
var is missing.

### Verifying a restore (recommended after first backup)

```sh
scripts/backup.sh                       # upload
scripts/restore.sh /tmp/restore-check   # pull into a scratch dir
diff -r data /tmp/restore-check && echo "OK: restore matches"
rm -rf /tmp/restore-check
```

### Daily schedule (launchd or cron)

Cron example (3:10am daily) — use absolute paths and log output:

```cron
10 3 * * * cd /Users/<you>/Projects/personal-trading-agent && /bin/bash scripts/backup.sh >> /tmp/pta-backup.log 2>&1
```

(launchd is the macOS-native alternative; a `LaunchAgent` calling the same
command on a `StartCalendarInterval` works identically.)

## Clearing sample/seed data

`clear-seed-data.sh` removes **sample-flagged** seed files from `data/` so the
dashboard shows its honest empty states instead of demo content. Only files
explicitly marked sample (`"sample": true` in JSON, `sample: true` in markdown
frontmatter) are removed; live records — which omit the marker or set it false —
are left untouched. It is safe and idempotent.

```sh
scripts/clear-seed-data.sh                 # clear sample-flagged files from data/
TRADING_DATA_DIR=/path/to/data scripts/clear-seed-data.sh   # target another root
```

It is allowlisted in the Operations panel as the confirm-gated
**Clear sample data** action (`clear-seed-data`). See the sample-data marker in
`.agents/data-format.md` for how records get flagged and which views surface the
"Sample data" indicator.
