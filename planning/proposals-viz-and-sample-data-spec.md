# Build Spec — proposal risk/reward viz + sample-data honesty

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/design-system.md`, `.agents/nextjs.md`, `.agents/data-format.md` first. Two feature branches + PRs. Reuse existing components/readers; no new real-money paths._

## M1 — `feature/proposal-risk-reward` — visualize risk/reward on proposals
Add a **risk/reward bar** + bolder key metrics to proposal cards in BOTH the Overview "Awaiting review" module and the full Proposals view.

- **R:R bar:** a horizontal track split into a **risk zone** (entry → stop) and a **reward zone** (entry → target), widths **proportional** to the price distances, with an **entry marker**. Risk zone uses the loss color, reward zone the gain color.
- Label below with **stop / entry / target prices + % distance** from entry, and show the **reward-to-risk ratio** prominently (`R:R 2.5 : 1`), computed as `(target − entry) / (entry − stop)` for buys, inverted for sells. Compute direction correctly for SELL proposals (stop above, target below).
- **Confidence** as a small meter, not just a number.
- **Degrade gracefully:** if a proposal has no defined stop or target, hide the bar (or show "no defined target") rather than rendering a broken/zero-width bar.
- **Accessibility:** the bar is decorative — add an `aria-label`/visually-hidden text equivalent summarizing "entry X, stop Y (−a%), target Z (+b%), R:R n:1" so it's screen-reader legible. Design-system colors only.
- **Acceptance:** proposals with stop+target render the bar with correct proportions and R:R for both buys and sells; missing fields degrade cleanly; light + dark + a11y verified; unit test the R:R/proportion math (pure function).

## M2 — `feature/sample-data-honesty` — never show seed data as if it were live
**Problem:** seed/fixture content (e.g. the news matching `src/test/fixtures/news/2026-06-24.json`, and seed proposals) currently renders identically to live data, with dead links — a real trust hazard for a trading tool.

- Introduce an explicit **`sample: true`** marker on seeded records (in their frontmatter/JSON), defined in `.agents/data-format.md`. Live records written by the routines/scout omit it (or set `sample: false`).
- Readers propagate the flag; **any view rendering one or more sample records shows a clear "Sample data" badge/banner** (e.g. on News, Proposals, Overview modules). Never show fabricated content as live.
- Add **`scripts/clear-seed-data.sh`** (allowlist it in the Operations panel) that removes sample-flagged files from `data/` so the user gets the honest empty states. Document it in `scripts/README.md`.
- Ensure the running app reads only from `data/` (real) — test fixtures must never be a live data source.
- **Acceptance:** with sample data present, every affected view shows the "Sample data" indicator; running `clear-seed-data.sh` yields the existing empty states; live scout/routine output renders with no badge; a test asserts a sample-flagged record triggers the badge.

## Immediate relief (no code)
Until M2 lands, deleting the seeded files under `data/` (news, proposals) on the Mac gives the honest empty states right away.

## Out of scope
- Real-money paths; new data sources.
