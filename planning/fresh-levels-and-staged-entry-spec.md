# Build Spec — fresh entry levels (stale-price fix) + staged/DCA entry plan

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `strategy/charter.md`, `strategy/playbook.md`, `.agents/infra.md`, `.agents/data-format.md` first. From a JKHY proposal: the red-team correctly caught that the proposed entry ($135) was **stale vs current trading (~$128)** — the whole stop/R:R/sizing was computed off a price the stock had already left. M1 is the priority correctness fix; M2 is the staged-entry feature. Each = its own branch + PR._

## M1 — `feature/fresh-entry-levels` (priority — correctness/safety)
Proposals must be built on the **current quote**, never a stale price:
- **Anchor entry/stop/target to the current Alpaca quote** at analysis time. For a marketable-limit entry, the entry sits at/near the current quote — never materially above/below it. Recompute stop/target/R:R/sizing off that anchor.
- **Refresh re-anchors levels.** "Refresh research" (and/or a "Refresh levels" action) must recompute entry/stop/target/sizing off the current quote, not just the narrative research.
- **Staleness guard at approval.** Before the approval AlertDialog, if the proposal's entry has drifted from the current quote beyond a small threshold (e.g. >1–2%), **warn and require a refresh** — do not place an order on stale levels. (This is a real-money correctness gate, distinct from the red-team's qualitative catch.)
- **Surface freshness:** show "levels as of HH:MM · price now $X" with a refresh affordance; flag when stale.
- Keep the red-team's stale-entry detection (belt and suspenders); this milestone prevents *generating* stale levels.
- **Acceptance:** a new proposal's entry equals/≈ the current quote; refreshing recomputes all levels off the live price; approving on stale levels (entry vs current quote beyond the threshold) warns/blocks until refreshed; the freshness indicator is shown; pure level-computation is unit-tested; trend + value lenses both fixed.

## M2 — `feature/staged-entry-plan` (DCA / scale-in)
An **optional staged-entry plan** on a proposal (most useful for value/mean-reversion):
- Split the **full intended position** into tranches with a schedule + condition — e.g. *25% now; after N days add another tranche if price is within ±X% of the prior fill; repeat until filled; then hold.* Defaults configurable in settings (tranche %, interval days, drift band).
- **Risk sized on the FULL position, not per tranche** — the stop and the ≤2% risk rail apply to the fully-filled position, so you're never over-risked at completion. Show the plan's total risk.
- **Each tranche is a normal gated, per-trade human approval** — the agent does NOT auto-execute the multi-day schedule. The plan is the *suggested* schedule + conditions; the human approves each tranche when due. Tranches count against the daily order cap; the full position respects the per-position size cap.
- Surface the plan on the proposal/detail page (tranche table: size, timing, condition, status) and in the MD/PDF export.
- **Honest framing:** DCA reduces *timing* risk but isn't free — averaging into a decliner can average into a loss; present it as an execution choice, not a guarantee. (Mostly conceptual at the current tiny live balance; scales with capital.)
- **Acceptance:** a proposal can carry an optional staged-entry plan with a tranche schedule + conditions; risk is computed on the full position; each tranche routes through the normal gated approval (no auto-execution); respects the daily-order + position-size caps; appears in the UI + exports; tested.

## Out of scope
- Auto-executing the DCA schedule without per-trade approval; gate/hard-rail changes; new data sources.
