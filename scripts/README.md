# Scripts

Helper scripts for the trading agent: the **scheduled routines** (launchd) and
the encrypted `data/` backups.

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
