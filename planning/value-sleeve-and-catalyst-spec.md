# Build Spec — value/mean-reversion sleeve + catalyst-check tightening

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `strategy/charter.md`, `strategy/playbook.md`, the routines, `.agents/data-format.md` first. From the KR analysis: the red-team correctly rejected KR under the **trend** mandate (counter-trend, below declining MAs, no volume, no technical catalyst). Adding a separate **value/mean-reversion** mandate lets names like KR be judged by criteria that actually fit — instead of forcing the trend red-team to loosen. Each milestone = its own branch + PR._

## Design principle (keep the mandates clean)
- This adds a **second strategy**, it does **not** weaken the trend strategy. Every proposal carries a `strategy` it's judged under; the red-team is briefed with the **matching mandate**. Never merge the two into one red-team — then neither is enforced.
- **Hard risk rails are shared and unchanged** for both strategies (2% risk, size cap, 5-position cap, 6-order/day, drawdown halt, stop-on-every-entry, marketable-limit). Only the *entry thesis criteria* and the *red-team lens* differ.
- **Fundamentals lead for the value sleeve** — the one deliberate exception to "technical-primary." Label it clearly as a separate mandate, not a blurring of the trend rules.
- Still fully human-approved + gated. Not investment advice.

## M1 — `feature/value-sleeve`
Add a `strategy` field to proposals: **`trend`** (existing) | **`value`** (mean-reversion). Schema + `.agents/data-format.md` + a new playbook section + a dated `charter.md` change-log entry (the human is authorizing a second mandate).

- **Value entry criteria + its own checklist** (distinct from the trend checklist):
  - **Quality** — profitable, durable business, sound balance sheet (not a broken company). Fundamentals (Perplexity, capped) are the **primary** driver here.
  - **Discount** — cheap vs its own history/peers (P/E, etc.) and/or near a multi-year/52-week low.
  - **Catalyst or floor** — a real why-now: dividend support/hike, analyst-target floor, insider buying, fundamental stabilization, OR a technical mean-reversion signal (oversold RSI, long-term support, capitulation volume, basing). Not "it's cheap" alone.
  - **Mean-reversion stop** — below a defined support / recent low; R:R and sizing per the shared hard rails.
- **Strategy-aware red-team.** Brief the prosecutor with the mandate matching the proposal's `strategy`:
  - **Trend red-team** (unchanged) — expects uptrend/momentum/volume; rejects counter-trend, no-catalyst chases.
  - **Value red-team** — **expects** counter-trend (below MAs is normal, NOT a reject reason); instead it hunts **value-trap** signals and rejects for: deteriorating fundamentals (falling revenue/margins, cut guidance/targets), no real catalyst/floor, a falling-knife/broken business, or an unrealistic target. (So even KR — soft Q1, margin compression, analyst target cuts — should likely still be *flagged* by the value red-team; that's correct. The point is a fair hearing under the right criteria, not auto-approval.)
- **Where value proposals come from:**
  - **Discovery:** an optional value bucket (cheap quality names near lows with a catalyst), gated behind a **setting** (enable value sleeve), separate from the trend universe.
  - **Manual analyze-a-symbol:** let the user pick the **lens** (Trend / Value) when analyzing a ticker, so they can evaluate KR as a value play deliberately.
- **UI:** each proposal shows a **strategy badge**; the checklist + red-team reasoning adapt to the proposal's strategy.
- **Acceptance:** a value proposal is judged by the value checklist + value red-team (NOT rejected merely for being below MAs); a value-trap (deteriorating fundamentals / no catalyst) is still flagged by the value red-team; trend proposals are unchanged; hard rails apply to both; manual analyze lets you choose the lens; tested for both mandates.

## M2 — `feature/catalyst-check-tightening`
Align the checklist with the red-team: the **"Catalyst — why now"** item passes ✓ **only for a named, specific catalyst** (a real `catalyst_type`). **`other` / `none` → flag (⚑), not a pass.** A generic catalyst should not green-check while the red-team rejects for "no named catalyst."
- **Acceptance:** a generic/`other`/`none` catalyst no longer fully passes the catalyst check (it flags); a named catalyst passes; the checklist and red-team now agree on catalysts; tested.

## Out of scope
- Execution / gate changes; loosening the hard risk rails; merging the two strategies into one red-team; options/crypto/margin.
