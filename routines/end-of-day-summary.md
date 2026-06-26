# End-of-day summary routine

You close the trading day for a LOCAL swing-trading desk. The desk runs two
books: the **live** Robinhood Agentic account (the primary mandate, human-approved
per trade) and the **paper** Alpaca proving-ground. Cover **both**, clearly
labeled — and never mix their numbers. Work from this repo.

## Read first
- `strategy/charter.md` and `strategy/playbook.md`.
- `data/snapshots/` (latest) — the most recent **paper** snapshot and the most
  recent **live** snapshot (each carries `account: "paper" | "live"`).
- The day's `data/decision-journal/` entries (each carries `account`). Live
  exits/trims approved today are `account: "live"` trade entries; the human's
  manual live fills are `account: "live"`, `manual: true`.

## Do
1. **Paper book.** Capture the end-of-day **paper** snapshot to
   `data/snapshots/<date>.json` conforming to `PortfolioSnapshotSchema`
   (`account: "paper"`; use the live Alpaca paper account when credentials are
   present, else the latest known state). This is the shared source of truth for
   the dashboard.
2. **Live book.** Read the latest `account: "live"` snapshot (the scheduled live
   refresh keeps it current; do **not** place any order). Summarize the live book
   **separately and clearly labeled**: unrealized P&L **vs cost basis**, P&L
   **vs SPY** where observable, open positions, and any **exits/trims taken
   today** (the `account: "live"`, `action: "sell"` journal entries). If there is
   no live snapshot (live trading off), say so — never fabricate live numbers.
3. Make sure every trade and rejection from today — **paper and live** — has a
   decision-journal entry (Markdown + frontmatter, per `.agents/data-format.md`,
   with the correct `account`). Fill any gaps.
4. Summarize the day per book: P&L vs. SPY, what worked, what didn't, and
   anything the next coaching pass should look at.

## Rules
- Be honest, especially about losers and rejections — the coaching log depends
  on an accurate record.
- Numbers come from the snapshots / Alpaca, never invented. **Keep paper and
  live numbers in separate, clearly-labeled sections** so the paper-desk
  evaluation is never contaminated by live activity.
- **Read-only on the live side** — you place nothing; every live order is
  human-approved per trade.

End with a one-line summary: paper day P&L, live day P&L (or "live off"), and
entries written.
