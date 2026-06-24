# Build Spec — preflight check + run-routine-from-dashboard

_Executable spec for a local Claude Code session. Read `AGENTS.md` + `.agents/*.md` first. Two small feature branches + PRs. Purpose: make starting the evaluation window safe (don't waste weeks on a silent misconfig) and let the user trigger routines from the cockpit instead of the CLI._

_Note: SPY risk metrics are **already wired** in `src/lib/server/eval.ts` (return + drawdown + volatility from Alpaca daily closes). Do not rebuild that._

## M1 — `feature/preflight` — `scripts/preflight.sh`
A one-shot readiness check. Prints a **PASS / WARN / FAIL** summary and exits non-zero on any FAIL.

Checks:
1. **`.env` + Alpaca vars** — `.env` exists; `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY`, `ALPACA_BASE_URL` are set (exact names). **WARN** if `ALPACA_BASE_URL` is not the paper URL. **WARN** if `APCA_API_KEY_ID`/`APCA_API_SECRET_KEY` are present (that's Alpaca's SDK naming — this app uses `ALPACA_*`, a common mix-up).
2. **Alpaca connectivity** — GET `${ALPACA_BASE_URL}/v2/account` with headers `APCA-API-KEY-ID` / `APCA-API-SECRET-KEY` (HTTP header names differ from the env var names). Confirm it authenticates and is a **paper** account; print equity + buying power. **FAIL** on auth error.
3. **Dashboard server** — reachable at `http://127.0.0.1:${PORT:-3000}`? Routine triggers POST there. **WARN** with start instructions if down.
4. **Trigger token** — if `ROUTINE_TRIGGER_TOKEN` is set in `.env`, remind that the running server must share it (restart the server after changing `.env`).
5. **`data/` writable** — ensure it's writable and the expected subdirs exist (`snapshots`, `decision-journal`, `coaching-log`, `logs`, `proposals`, `research`); create if missing.
6. **launchd** — report which `com.tradingdesk.*.plist` exist in `~/Library/LaunchAgents` and which are currently loaded (`launchctl print`/`list`). **WARN** if none loaded (the desk won't run on a schedule).
7. **Notifications** — **WARN** if `NOTIFY_PROVIDER` and healthchecks pings are off (no heartbeats / dead-man switch during the window).
8. **Charter** — `strategy/charter.md` and its machine-readable config are present and parse.
9. **Timezone** — **WARN** that routines assume a US/Eastern Mac clock; print current TZ and the next scheduled fire time per routine.

Add a **`--shakedown`** flag: with the dashboard server up, trigger `scripts/run-routine.sh pre-market-research`, then verify a fresh run log appears in `data/logs/` and report any proposals / journal entries / rejections written. This proves the propose → gates → journal path end-to-end before you rely on the schedule.

**Acceptance:** on a misconfigured setup (e.g., missing/renamed key) preflight FAILs with a precise message; on a good setup it PASSes and prints the paper account equity; `--shakedown` produces a run log and reports the artifacts written. Document it in `scripts/README.md`.

## M2 — `feature/ops-control-panel` — run operational scripts from the dashboard
A new **Operations** view with buttons that trigger a fixed, **allowlisted** set of the repo's scripts server-side (the backend already spawns local subprocesses), with live output streaming and a pass/fail result. This includes the "Run now" routine triggers and generalizes to the operational scripts.

**Hard security contract (non-negotiable):**
- **Allowlist only.** The API maps a fixed set of action IDs → specific scripts + fixed args. It must NEVER accept an arbitrary script path / name / args from the client; no client string is ever interpolated into a command.
- **No shell.** Use `execFile`/`spawn` with an **args array** and `shell: false`. No `exec`, no string concatenation (prevents command injection).
- **Token + localhost.** Gate these endpoints behind the bearer token (as `run-routine` does) and bind to 127.0.0.1. Never expose publicly.
- **Confirm destructive actions** with an `AlertDialog` (design system). Stream stdout/stderr via SSE; show the exit code.

**Allowlisted actions:**
| Action | Script / command | Class |
|---|---|---|
| Preflight check | `preflight.sh` | safe |
| Preflight + shakedown | `preflight.sh --shakedown` | safe (paper) — light confirm |
| Run a routine | `run-routine.sh <id>` | safe (paper) |
| Backup (dry-run) | `backup.sh --dry-run` | safe |
| Backup now | `backup.sh` | confirm |
| Install routine plists | `install-routines.sh` | confirm (writes plists; does not load) |
| Start/stop autonomous paper desk | `launchctl bootstrap`/`bootout` per plist | **confirm, clearly labeled** — starts/stops scheduled PAPER trading; reversible |
| Kill switch | `kill-switch.sh` | prominent, one-click + confirm — always safe (closes everything) |

**Excluded from the dashboard by design (no buttons):**
- Anything that **opens the live-trading harness gate** (`.claude/settings.json` allow-list edit) or **funds** the account — deliberate manual human actions per the Phase 3 two-gate design. The dashboard may *close* the gate (kill switch), never *open* it.
- `restore.sh` overwriting `./data` — if exposed at all, only into a scratch dir with a typed confirm; otherwise CLI-only (it can clobber the live journal).
- Dev/git scripts (`new-branch-commit.sh`).

**Acceptance:** the Operations view runs each allowlisted action with streamed output + exit status; destructive actions require confirm; the endpoint **rejects any non-allowlisted action ID** and any attempt to pass a path/args; token + localhost enforced; the kill switch is reachable in one click (with confirm). Include a test proving a crafted request with an arbitrary command/path is refused.

## Out of scope
- SPY risk metrics (already wired in `eval.ts`).
- Any real-money path (Phase 3 M5 stays gated).
