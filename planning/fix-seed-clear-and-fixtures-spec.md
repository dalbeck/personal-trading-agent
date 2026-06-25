# Fix Spec — make "clear data" actually work + stop reading test fixtures

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/data-format.md`, `.agents/nextjs.md` first. Two small feature branches + PRs. No real-money paths._

## Problems observed
1. **"Clear sample data" no-ops on real seed.** The seed files in `data/` (snapshots, decision-journal, coaching-log, logs, research) are **not flagged `sample: true`**, so the clear action deletes nothing and reports "nothing to clear" — while the seed keeps rendering. The honesty feature is effectively lying.
2. **Proposals & news exist only in `src/test/fixtures/`** (`vitest.config.ts` sets `TRADING_DATA_DIR=src/test/fixtures` for tests). If they render in the running app, the dev server is reading test fixtures. The app must **never** read `src/test/fixtures` outside vitest.

## M1 — `feature/reset-desk-data`
- Add a **"Reset desk data"** Operations action (allowlisted; destructive → `AlertDialog` confirm) that clears **all** desk artifacts under the app's **resolved `DATA_DIR`** (honor `TRADING_DATA_DIR`, do not hardcode): `snapshots/`, `decision-journal/`, `coaching-log/`, `logs/`, `proposals/`, `news/`, `research/`, plus any other desk dirs. Keeps the directories, removes their files.
- It must target the **same directory the app reads from**, so it can't silently clear the wrong place.
- Keep "Clear sample data" for the flagged-only case.
- **Acceptance:** after Reset desk data, every panel shows its honest empty state; the action reports exactly what it removed; confirm dialog required; operates on `DATA_DIR` (verified against `TRADING_DATA_DIR`).

## M2 — `feature/clear-honesty-and-fixtures`
- **Honest reporting:** if "Clear sample data" finds nothing flagged but `DATA_DIR` is **non-empty**, it must say so — e.g. "no sample-flagged files, but N other files remain — use Reset desk data" — never imply the panels are clean when they aren't.
- **No fixtures at runtime:** audit that the running app resolves data only from `DATA_DIR` and never from `src/test/fixtures` outside vitest. If any dev convenience points `TRADING_DATA_DIR` at the fixtures, remove it; if a populated dev view is wanted, ship clearly **`sample: true`-flagged** seed inside `data/` instead of pointing at test fixtures.
- **Flag the seed (if keeping any bundled demo data):** ensure every bundled/demo record carries `sample: true` so the clear/badge path is consistent with `.agents/data-format.md`.
- **Acceptance:** the running app never renders `src/test/fixtures` content; "Clear sample data" reports accurately when unflagged files remain; a test asserts the app's data readers do not resolve to the fixtures path at runtime.

## Out of scope
- Real-money paths.
