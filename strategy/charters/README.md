# Sleeve charters — shared safety envelope & cross-sleeve change-log

This directory holds the **per-sleeve charters**. The desk runs one governed
pipeline (research → checklist → risk rails → red-team → human-approved, gated
execution) across multiple **sleeves** (`style × horizon`). Each sleeve has its
own mandate, universe, rails, sizing model, red-team lens, checklist, benchmark,
and cadence — routed in [`../sleeves.config.ts`](../sleeves.config.ts). The one
thing every sleeve shares, and **no sleeve may override**, is the safety envelope
below.

> **The swing desk's constitution is [`../charter.md`](../charter.md)** — the
> funded account's immutable rules. It is **not edited by the sleeve work**; it
> remains the swing charter with its own change-log. New mandates live in this
> directory (`core-long.md`, `position-mid.md`); cross-sleeve framework notes
> live in this file's change-log.

## Inherited safety envelope (shared, non-negotiable)

Every sleeve inherits the following. These are **enforced in code** — their
source of truth is [`../charter.config.ts`](../charter.config.ts) and the live
guards in `src/lib/server/live-guards.ts`, kept in lockstep by the tripwire tests
(`charter-config.test.ts`, `sleeves-config.test.ts`). This section is
documentation of those enforced caps; **editing the prose here never changes
enforcement.** A sleeve can never define its own envelope, and the agent can
never raise any rail or open a gate.

- **The Phase-3 live envelope is cross-sleeve and fixed** — `LIVE_LIMITS`: the
  account-exposure ceiling, the weekly funding cap, and the live drawdown kill
  switch. Adding sleeves never increases total real-money exposure beyond it; an
  order in any sleeve that would breach it is rejected and journaled.
- **One shared daily order budget** — the single `maxOrdersPerDay` (6) is one
  counter across *all* sleeves. More sleeves never means more daily orders.
- **Two-gate, per-trade human approval** — every sleeve's approvable proposals
  flow the same `POST /api/live/approve` path; gate closed → dry-run sink, gate
  open → broker. The agent never opens a gate, funds the account, or places an
  order without explicit per-trade human approval. The app never auto-trades.
- **Prohibited universe** — options, crypto, futures, and margin are excluded for
  every sleeve. ETF/index permission is a *per-sleeve universe* grant (core-long
  only), never a global one; SPY/VOO/QQQ stay benchmark-only in the swing sleeves.
- **The agent never edits a charter or this file, and never raises a rail.**
  Charters and the rail config are human-owned constitution.

## Per-sleeve change-logs

Swing changes → [`../charter.md`](../charter.md). Per-sleeve mandate changes →
that sleeve's charter (`core-long.md` / `position-mid.md`). **Cross-sleeve**
changes (framework, rails-routing, portfolio layer, tax, verdict matrix) → the
change-log below. Newest first.

## Change-log (cross-sleeve)

> **2026-06-29 — Multi-sleeve verdict matrix on one proposal (verdict-matrix M7).**
> Generalized the **dual-lens** evaluation (trend + value) to **N sleeve-lenses**:
> a manually analyzed symbol can be evaluated under the swing pair **plus** any
> selected `position-mid` / `core-long`, each running its **own checklist + own
> red-team** and storing its own per-lens verdict, levels, sizing, and conviction —
> **research is fetched once** and shared. The proposal detail renders a **sleeve ×
> verdict matrix** (each evaluated sleeve's red-team pill + levels + conviction);
> a sleeve the human didn't select reads **"not evaluated," never a fake pass.**
> Each lens carries an explicit **`sleeve`** (back-compat: derived from `strategy`).
> **Approval is unchanged in substance:** the human still approves **exactly one
> sleeve's** version — `resolveActiveLens` drives the order, the gate resolves that
> sleeve's rails (a `core-long` acting lens gates under its review-trigger rail, not
> the swing stop rail), and the journal records the acting `sleeve:<id>` tag.
> Autonomous discovery stays single-sleeve. The matrix is a **review aid**, not a
> new execution path; no rail, gate, or envelope changed. Rationale: a name can be
> a strong long-term core hold but a weak swing setup — show all of it on one
> proposal so the human reviews every aspect at once. See
> `planning/portfolio-sleeves-and-horizons-spec.md`.

> **2026-06-28 — Tax-lot & holding-period surfacing (tax-awareness M6, advisory).**
> Surfaced tax context for the longer-horizon book: per-position **holding period**
> with the **long-term line (365 days)** and a **LT/ST badge** on the Positions
> table, an **unrealized long-term vs short-term split** on the Portfolio view, a
> **wash-sale warning** on a loss-realizing sell with a same-symbol buy inside 30
> days (and the reverse — a buy after a recent sale, treated as a *possible* loss
> advisory), and a **"nearly long-term" sell note** when a gain lot is within ~a
> month of the 365-day line. **All of this is surfaced caution, never a hard
> block** — consistent with how weak catalysts/targets are flagged, not gated — and
> there is **no automated lot selection** (deferred). No rail, gate, sizing, or
> red-team change; advisory only (`src/lib/tax.ts`, `src/lib/server/tax-advisory.ts`).
> Rationale: once "long-term" is a goal, the human needs holding-period and
> wash-sale visibility to decide well — without the desk optimizing taxes on their
> behalf. See `planning/portfolio-sleeves-and-horizons-spec.md`.

> **2026-06-28 — Portfolio allocation & rebalancing layer (portfolio M5).** Added a
> portfolio-management layer **above** the sleeves: a human-set **target allocation
> across sleeves** (`data/control/allocation-targets.json`,
> `AllocationTargetsSchema`), which the **agent reads and proposes against but never
> edits** (charter-style discipline, like the rails and the charters). Holdings are
> attributed to a sleeve from the trade journal — approvals now stamp a
> `sleeve:<id>` tag — so per-sleeve **drift** vs the targets, per-sleeve + **blended
> performance** (no cross-sleeve bleed), and **rebalancing suggestions** (trim the
> overweight, add to the underweight, the add side **scaled in over tranches** with
> the staged-entry machinery) can be computed. Suggestions are review-only drafts
> the human queues into the **normal gated, per-trade-approved path**; nothing
> auto-trades. Added a new **Portfolio** view (target vs current, drift,
> performance, suggestions, the targets editor) and a **portfolio-rebalance-review**
> routine on a monthly cadence (core/mid don't want a daily idea hunt; discovery
> stays sleeve-appropriate via the existing sleeve flags). **No safety guard
> changed:** the 6-order/day cap, the live exposure envelope, and the two-gate +
> per-trade-approval model all still bind. Rationale: turn several sleeves into one
> managed portfolio with explicit, human-owned target weights. See
> `planning/portfolio-sleeves-and-horizons-spec.md`.

> **2026-06-28 — Rails resolved per sleeve + target-weight sizing (per-sleeve-rails M2).**
> The risk engine (`src/lib/risk/`) now resolves rails from the proposal's
> **sleeve** (`railsForSleeve` in `sleeves.config.ts`) rather than one global
> block. The **swing rails are byte-identical** (`RISK_LIMITS` unchanged,
> tripwire-tested in `charter-config.test.ts`); new rail blocks were added for
> `position-mid` (stop still required, 25% per-name size) and `core-long` (60%
> per-name, looser 60% sector cap, **no stop**). Added a second **sizing model** —
> **`target-weight`** (size to a target portfolio weight, clamped by the sleeve's
> size cap and the live envelope; `sizeByTargetWeight` in `risk/sizing.ts`)
> alongside the extracted **`risk-to-stop`** model, and made the stop a **sleeve
> property** (`requiresStop`): `true` for `swing-*` and `position-mid` (a stopless
> entry is still rejected and journaled), `false` for `core-long` (a wide
> drawdown/**review trigger** — the new `review-trigger` rail — replaces the stop,
> bounded to ≤50%). **No safety envelope changed:** every rail block keeps
> `maxOrdersPerDay 6` as the one shared counter across all sleeves, and the
> Phase-3 `LIVE_LIMITS` exposure ceiling / weekly funding cap / live drawdown kill
> switch stay **cross-sleeve and unchanged** (a no-stop target-weight order is
> still bound by the $500 account ceiling); the agent can never raise any rail or
> the envelope. Rationale: different horizons need different entry rails and
> sizing, but the real-money envelope must bind them all equally. See
> `planning/portfolio-sleeves-and-horizons-spec.md`.

> **2026-06-28 — Sleeve model: style × horizon (sleeve-framework M1).** Promoted
> the per-proposal **`strategy`** (`trend | value`) into a first-class **`sleeve`**
> with a **`horizon`** (`swing | mid | long`). The existing mandates became
> **`swing-trend`** (default) and **`swing-value`** sleeves with **byte-identical
> rails, universe, sizing, and red-team lenses** — no swing behavior changed; the
> `charter.config.ts` swing rail numbers are untouched and stay tripwire-tested
> (`sleeves-config.test.ts` re-asserts the swing sleeves route to `charter.md` and
> the unchanged `RISK_LIMITS`). Declared (disabled) two new horizons for later
> milestones: **`position-mid`** (weeks–quarters) and **`core-long`**
> (quarters–years, **ETF/index-allowing**, **target-weight sizing**, **no
> protective stop** — a wide drawdown/review trigger instead). A sleeve bundles
> `{ horizon, mandate, universe, sizingModel, rails, redTeamLens, checklist,
> benchmark, cadence }`; sleeves differ only in entry criteria, rails, sizing,
> lens, and cadence — **never in the real-money envelope**. The Phase-3
> `LIVE_LIMITS` ceiling and the 6-order/day cap remain **cross-sleeve and
> unchanged**, and the two-gate + per-trade-approval safety model is unchanged.
> New sleeves are **opt-in** (off by default), like the value sleeve. Rationale:
> extend the same governed pipeline from a single swing mandate to a multi-horizon
> portfolio manager without weakening any guard. See
> `planning/portfolio-sleeves-and-horizons-spec.md`.
