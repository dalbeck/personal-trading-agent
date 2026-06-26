# Build Spec — proposal generation: volume, diversification, manual analyze

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/infra.md`, `strategy/charter.md`, `strategy/playbook.md`, the routines, and `.agents/data-format.md` first. Each milestone = its own branch + PR._

## Honest framing (encode these as design constraints, not just prose)
- **Proposals are review candidates, not orders.** The daily ORDER cap stays **6** (hard rail, unchanged). The IDEA cap is separate and can be larger.
- **A trend/relative-strength strategy concentrates in the leading sector by design.** Diversification here means **best-in-sector** (strongest setup *within* each sector), NOT buying laggards.
- **More proposals ≠ more good trades.** A larger funnel must be **ranked + tiered by conviction** so the best surface first — but **the owner wants MORE opportunities by default and would rather see them than miss them.** So: **surface ALL tiers by default** (don't hide the marginal ones), just sorted high-conviction first. The daily count is still a **target, not a quota** — never fabricate filler when setups genuinely don't exist, but cast a wide net.
- **Volume + diversification are user PREFERENCES, not safety rails** — they belong in a settings panel the owner can tune freely (unlike the hard risk rails / the 6-order cap, which stay fixed). Default generous; let the human dial down if it becomes cognitive overload.

## M1 — `feature/diversified-discovery`
Tune discovery to produce a larger, sector-diversified, ranked candidate set:
- **Decouple the caps.** Add `DISCOVERY_IDEA_CAP` — **default generous (~20, allow up to ~40)** — for proposals per run, separate from the daily ORDER cap (6, unchanged). Update `charter.config.ts` (`DISCOVERY_LIMITS`), `strategy/charter.md` (Discovery caps section + a dated change-log entry — the human is authorizing the larger funnel), and the tripwire test. Note in the charter that this is a *review-funnel preference*, not a safety rail.
- **Broaden the universe.** Scan a multi-sector candidate universe (e.g., sector-ETF top holdings / market movers per sector / a curated list spanning all GICS sectors) so non-tech names actually enter consideration — not a tech-heavy shortlist.
- **Sector-bucketed, best-in-sector ranking.** Classify candidates by sector; within each sector rank by the playbook's signals (trend, momentum, relative strength, volume, R:R, catalyst); surface the **top setups per sector**.
- **Per-sector cap + spread.** Cap proposals per sector (e.g. ≤3) and aim for ≥N sectors represented, so the queue is a mix. Skip a sector with no decent setup rather than forcing one.
- **Rank + conviction tiers.** Score each proposal (composite of the checklist signals) and tag a tier (`high` / `moderate` / `watch`); the queue **sorts high-conviction first but shows ALL tiers by default** (the tier drives sort + an optional filter, never hiding by default). Surface the tier as a clear badge in the data + UI.
- Every candidate still clears the **risk rails + red-team**.
- **Acceptance:** a discovery run yields ~10–20 ranked candidates spread across multiple sectors (provably not all one sector); the per-sector cap holds; conviction tiers are assigned and sorted; idea cap ≠ order cap; charter + config + change-log updated; tested on a synthetic multi-sector universe.

## M2 — `feature/manual-analyze-symbol`
On-demand proposal for a user-given symbol:
- A **"Analyze a symbol"** action (ticker input + button) in the Proposals view (and/or Overview), plus an API route, that runs the **full pipeline** for the entered ticker: research (Alpaca technicals + optional capped Perplexity Finance) → build a proposal (thesis, stop/target/R:R, catalyst, sizing for the active book) → **risk rails → red-team verdict** → present it for review like any other proposal.
- **User-initiated** (bounded; respects the Perplexity daily cap; falls back to free sources when off/capped). Works per mode (paper/live; advisory vs approvable as the live rules dictate).
- A manual symbol **still passes the rails + red-team** — it can be flagged/rejected, and that's surfaced honestly (don't bypass the gates for a manual pick). Tag the proposal `manual-request` in the journal.
- **Acceptance:** entering a ticker produces a complete proposal with research + red-team verdict within the caps; it routes through rails + red-team (a weak manual pick is flagged, not rubber-stamped); tagged `manual-request`; no execution beyond the normal gated approval flow; tested.

## M3 — `feature/discovery-settings`
Make the funnel **user-tunable** (so the owner can crank it up now and dial back if it becomes overload) — a settings panel in **Risk settings** (or Operations), persisted like the existing risk-settings overlay:
- **Settings (preferences, freely tunable — clearly separated from the hard safety rails):**
  - `DISCOVERY_IDEA_CAP` (proposals per run) — default ~20.
  - Per-sector cap + sector-spread target.
  - **Minimum conviction tier to surface** (default `watch` = show everything; raise to `moderate`/`high` if overloaded).
  - Optional: default queue filter (show all / hide watch) — a *view* preference, default show-all.
- These overlay the charter defaults; the **hard risk rails and the 6-order cap are NOT here** and are not tunable from this panel (keep that boundary explicit in the UI copy).
- **Acceptance:** the owner can raise/lower the idea cap, per-sector cap, and min-conviction-to-surface from the UI; changes take effect on the next discovery run; the panel clearly labels these as funnel *preferences*, distinct from the safety rails; persisted; tested.

## Out of scope
- Raising the daily ORDER cap or any execution/gate change (unchanged). Auto-acting on proposals (still human-approved). Options/crypto/margin.
