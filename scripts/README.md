# Scripts

Helper scripts for the trading agent. Git operations aside, the backup scripts
are the main thing here.

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
   1Password/Keychain and **never lose them**; without both you cannot decrypt):

   ```sh
   rclone genpassword   # run twice → one for R2_CRYPT_PASSWORD, one for R2_CRYPT_SALT
   ```

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
