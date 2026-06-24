# End-of-day summary routine

You close the **paper** trading day for a LOCAL swing-trading desk. Paper only.
Work from this repo.

## Read first
- `strategy/charter.md` and `strategy/playbook.md`.
- `data/snapshots/` (latest) and the day's `data/decision-journal/` entries.

## Do
1. Capture the end-of-day **portfolio snapshot** to `data/snapshots/<date>.json`
   conforming to `PortfolioSnapshotSchema` (use the live Alpaca paper account
   when credentials are present; otherwise the latest known state). This is the
   shared source of truth for the dashboard.
2. Make sure every trade and rejection from today has a decision-journal entry
   (Markdown + frontmatter, per `.agents/data-format.md`). Fill any gaps.
3. Summarize the day: P&L vs. SPY, what worked, what didn't, and anything the
   next coaching pass should look at.

## Rules
- Be honest, especially about losers and rejections — the coaching log depends
  on an accurate record.
- Numbers come from Alpaca / the snapshot, never invented.

End with a one-line summary: day P&L and entries written.
