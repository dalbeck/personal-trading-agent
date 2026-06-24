# Personal Trading Agent — Architecture & Build Plan

_Companion to `feasibility-and-plan.md`. Captures the design decisions made in planning. Not investment advice._

---

## Guiding decisions (locked)

| Area | Decision |
|---|---|
| **Goal** | Swing/position trading (hold days–months), individual names + fractional shares. Measured **benchmark-relative vs. SPY** with hard risk caps. **Not** a 5%/week target (see feasibility doc §4). |
| **Capital** | ~$100/week deposits, capped/expendable "tuition." Paper first. |
| **Execution brokers** | **Alpaca** (paper → the build/proving ground). **Robinhood Agentic** (optional live, Phase 3). Fidelity excluded (no automation API). |
| **LLM runtime** | Claude Code on **Max plan**, Codex CLI on **Codex Pro** — used as the harnesses (no metered API). Backend spawns the CLIs as subprocesses. |
| **Interface** | Local **Next.js + Tailwind** dashboard = primary cockpit. **Cowork** (Claude app) = optional mirror via shared repo files. |
| **Hosting** | Native on macOS (no DDEV/Docker). `pm2` or launchd keeps it alive. |
| **Design** | Robinhood UI design skill (corrected) + **light & dark** modes. |
| **Source control** | Private git remote for code/docs/strategy. |
| **Backups** | `data/` (journals, snapshots, chats) → **Cloudflare R2, encrypted, gitignored**. |

---

## 1. System overview

Three actors share one source of truth — the **project folder** (git + R2-backed). Nothing depends on a live socket between them; they coordinate through files.

```
                       ┌─────────────────────────────────────┐
                       │     personal-trading-agent/  (repo)  │
                       │  strategy/ · data/ · planning/ · src/ │
                       └───────────────┬─────────────────────┘
        writes/reads                   │ shared files            reads/writes
   ┌───────────────────┐               │               ┌────────────────────────┐
   │  SCHEDULED ENGINE │───────────────┼──────────────▶│  DASHBOARD (Next.js)    │
   │  claude -p /      │   journals,    │   proposals,  │  - view everything      │
   │  codex exec       │   snapshots    │   rule edits  │  - chat (spawns CLIs)   │
   │  (local cron/     │◀───────────────┼───────────────│  - approve trades       │
   │   launchd routines)│              │               │  - edit strategy rules  │
   └─────────┬─────────┘               │               │  - start/stop routines  │
             │ MCP tools               │               └────────────────────────┘
             ▼                         │
   ┌───────────────────┐               │               ┌────────────────────────┐
   │ BROKER MCP / API  │               └──────────────▶│  COWORK (Claude app)    │
   │ Alpaca (paper)    │   same folder, optional mirror │  second window on files │
   │ Robinhood (live)  │                                └────────────────────────┘
   └───────────────────┘
```

**The mirror, precisely:** the dashboard cannot reach *into* Cowork (no such API). Both simply operate on the same folder, so a journal the engine writes, or a rule you edit in the dashboard, is immediately visible in Cowork and vice versa. File/git-based sync, not a socket.

---

## 2. The engine (Claude is the bot)

Pattern borrowed from the Nate Herk video (engine) + the Reddit desk (governance). No long-running Python process — scheduled harness sessions read a prompt file, call broker tools, and write markdown.

**Five routines** (local launchd/cron, each a `claude -p` or `codex exec` session):
1. **Pre-market research** — scan watchlist, news, regime read → candidate ideas.
2. **Market-open execution** — apply rules, size positions, place (paper) orders through stops.
3. **Midday scan** — manage open positions, stops, risk.
4. **End-of-day summary** — P&L, journal entries, snapshot.
5. **Weekly review (Sun)** — coaching pass, promote durable lessons into the playbook.

**Governance files (`strategy/`)** — copied structurally from the Reddit desk:
- `charter.md` — immutable constitution: universe (listed equities only, no options/crypto/margin), per-position cap, daily order cap, drawdown circuit breaker, emergency halt, marketable-limit orders only.
- `playbook.md` — pre-trade checklist + banked lessons.
- `decision-journal/` — one entry per trade **and per rejection**, written at decision time.
- `coaching-log/` — next-morning self-grade vs. actual prices.

**Adversarial gate:** Codex (`codex exec`, different model family) acts as a red-team prosecutor that defaults to "no" on every proposed trade. Value is the hostility, not a second opinion.

**Two-gate live safety** (Phase 3 only):
1. Broker gate — Robinhood Agentic account allows agent trading.
2. Harness gate — a one-time human `settings.json` allow-list edit enables `place_equity_order`; the agent can never grant itself this. Per-trade approval stays ON until paper results justify otherwise.

---

## 3. The dashboard (Next.js + Tailwind)

Local web app at `localhost`. **Everything viewable and interactive here.**

**Views**
- **Overview** — dual account panels: `PAPER` (Alpaca live API) and `LIVE` (Robinhood, from agent-written snapshots). P&L, equity curve, vs-SPY benchmark.
- **Positions** — open positions, stops, sizing, per-position P&L (`tabular-nums`).
- **Decision Journal** — readable feed of trades + rejections with reasoning.
- **Proposals** — pending agent ideas with **Approve / Reject** (AlertDialog confirm on anything that moves real money).
- **Strategy** — view/edit `charter.md`, `playbook.md`, rules. Edits write back to the repo.
- **Chat** — live conversation with Claude/Codex; backend streams from the spawned CLIs (uses your subscriptions, not API).
- **Routines** — list of scheduled jobs; start/stop/"run now"; last-run status + dead-man-switch health.
- **Logs** — run transcripts, errors, heartbeat status.

**Backend (Next.js API routes / Node)**
- Reads/writes repo files (journals, strategy, proposals).
- Calls Alpaca REST for the paper view.
- Spawns `claude -p` / `codex exec` child processes; streams stdout to the browser via SSE.
- Manages the local schedule (start/stop/trigger routines).
- **Live order placement still passes the two-gate permission flow** — the dashboard surfaces approvals; it does not bypass the harness gate.

**Stack notes**
- Next.js App Router, **Tailwind**, server components for data, client components for chat/streaming.
- Use the installed **Vercel Next.js skills** during scaffolding.
- Run native (`next dev` for dev; `pm2`/launchd for always-on). No DDEV.

---

## 4. Design system (Robinhood skill, corrected + dual-mode)

Source: `ihlamury/design-skills` → `skills/robinhood` (MIT). Kept: **Inter**, 4px grid, lime accent, pill radii, dark base, focus/motion/accessibility rules. Corrected: the skill's mis-scraped semantic colors (it labeled the lime as a card surface and a low-contrast gray as primary text) and its marketing-scale typography (85px/1920px). Added: a **light theme** (skill is dark-only) and **gain/loss** trading colors.

Implemented as CSS variables toggled by Tailwind's `dark` class.

**Dark mode**
| Token | Hex | Use |
|---|---|---|
| `surface-base` | `#000000` | page background |
| `surface-raised` | `#0E0E0E` | cards |
| `surface-overlay` | `#1A1A1A` | modals, popovers |
| `border-default` | `#2A2A2A` | dividers |
| `text-primary` | `#ECECEC` | headings/body |
| `text-secondary` | `#A0A0A0` | muted |
| `accent` | `#B7DF2F` | primary actions, focus, links |
| `accent-hover` | `#C3FE09` | hover |

**Light mode** (designed to match)
| Token | Hex | Use |
|---|---|---|
| `surface-base` | `#FFFFFF` | page background |
| `surface-raised` | `#F7F7F7` | cards |
| `surface-overlay` | `#FFFFFF` + shadow | modals |
| `border-default` | `#E5E5E5` | dividers |
| `text-primary` | `#1A1A1A` | headings/body |
| `text-secondary` | `#5C5C5C` | muted |
| `accent` | `#B7DF2F` (black text on fill) | primary actions, focus |

**Trading semantics (both modes)**
| Token | Dark | Light | Use |
|---|---|---|---|
| `gain` | `#00C805` | `#00A301` | price up, profit |
| `loss` | `#FF5000` | `#E03A00` | price down, loss |

**Rules carried over:** Inter throughout, `tabular-nums` for all numbers, `text-balance`/`text-pretty`, 4px spacing grid, pill radii (default 21px, 12–19px for cards), 2px lime focus outline (never removed), animations ≤200ms on `transform`/`opacity` only, respect `prefers-reduced-motion`, `AlertDialog` for destructive/irreversible actions, `aria-label` on icon-only buttons, `h-dvh` not `h-screen`.

---

## 5. Repo layout, source control & backups

```
personal-trading-agent/
  planning/              → git   (this doc, feasibility)
  src/                   → git   (Next.js dashboard)
  strategy/              → git   (charter, playbook, rule files)
  routines/              → git   (prompt files + scheduler scripts)
  scripts/               → git   (rclone backup, healthcheck, lockfile)
  data/                  → R2 ONLY, gitignored
    decision-journal/    (per-trade + rejection entries)
    coaching-log/
    snapshots/           (portfolio/positions captured by engine)
    chats/               (saved LLM conversation MD)
  .env                   → gitignored (Alpaca keys, tokens)
  .env.example           → git
  .gitignore             → ignores .env, /data
```

**Three-tier backup**
1. **Code + docs + strategy → private git remote** (GitHub/GitLab private). Full history; primary restore via `git clone`.
2. **Secrets → never in git.** `.env` gitignored; real values in 1Password / macOS Keychain.
3. **`data/` → Cloudflare R2, encrypted, gitignored.** Daily `rclone` (with `crypt`) job from `scripts/`; client-side encrypted before upload. R2 free tier, no egress fees. (Optionally mirror the same snapshot to Google Drive — but never live-symlink the working tree into Drive; it corrupts `.git`.)

**Restore on a new machine:** install + auth Claude Code & Codex → `git clone` the repo → `rclone copy` `data/` back from R2 → recreate `.env` from password manager → run.

---

## 6. Phased build

- **Phase 1 — Dashboard + read-only research (paper).** Scaffold the Next.js+Tailwind app with the design system, dual-mode theming, all views reading a mock/seed file structure. Wire Alpaca paper data + the chat panel (CLI subprocess streaming). Engine proposes trades to the journal; **no execution**. Set up git + R2 backup. _Clickable, zero money at risk._
- **Phase 2 — Paper trading the strategy (60–90 days).** Encode `charter.md` + rules, the five routines, the Codex red-team gate, decision journal + coaching loop, dead-man switch/heartbeats. Run against Alpaca paper. Benchmark vs. SPY. Go/no-go gate.
- **Phase 3 — Optional small live pilot.** Only if Phase 2 beats the benchmark. Connect Robinhood Agentic account, fund the weekly cap, per-trade approval ON, two-gate permissions. Compare live vs. paper expectation. Kill switch ready.

**Never:** un-capped, un-approved, always-on authority over money you can't afford to lose.

---

### References
- Robinhood Agentic setup & access — https://robinhood.com/us/en/support/articles/agentic-trading-overview/
- Design skill — https://github.com/ihlamury/design-skills/tree/main/skills/robinhood
- Engine reference (Nate Herk) — https://www.youtube.com/watch?v=6MC1XqZSltw
- Governance reference (Reddit desk) — https://www.reddit.com/r/ClaudeAI/comments/1ucy85c/
- Alpaca API — https://docs.alpaca.markets/us/docs/trading-api
