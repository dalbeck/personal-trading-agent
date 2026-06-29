# Build Spec — portfolio sleeves & investment horizons (short / mid / long)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `strategy/charter.md`, `strategy/charter.config.ts`, `strategy/playbook.md`, the routines, `.agents/data-format.md`, and `.agents/infra.md` (two-gate design) first. Each milestone = its own feature branch + PR. **This evolves the desk from a single swing-trading mandate into a multi-horizon portfolio manager — short-term swing, mid-term position, and long-term core (ETF/index-allowing) — without changing how the existing swing desk behaves or weakening any real-money guard.**_

## Why this exists

The desk began as a quick-wins swing-trading research desk: technical, trend-following, US single names only, a stop on every entry, SPY as a benchmark and never a holding. That mandate stays — it is sound and it guards a funded live account. But the owner now wants the **same governed pipeline** (research → checklist → risk rails → red-team → human-approved, gated execution) to also run a **mid-term and long-term book**, including **ETFs and index funds**, so the tool becomes a portfolio manager across horizons rather than only a day/week trading desk.

The precedent for how to do this already exists in the repo: the **value sleeve** (`strategy: value`, charter change-log 2026-06-26) proved the architecture can carry a **second mandate with its own checklist and its own red-team lens, opt-in, without touching the trend desk**. This spec generalizes that one axis (style: `trend | value`) into two axes — **style × horizon** — by promoting the `strategy` field into a first-class **sleeve**.

## Design principles (keep the sleeves clean and the guards intact)

- **Additive, never a refactor of behavior.** The existing swing/trend and swing/value mandates become **sleeves with byte-identical rails, universe, and red-team lenses**. No swing proposal should evaluate, size, or gate any differently after this work. The `charter.config.ts` swing rail numbers are unchanged and stay tripwire-tested.
- **Route to a per-sleeve charter; never reopen the swing charter.** `strategy/charter.md` is the funded desk's immutable constitution — this work **does not touch it.** It remains the **swing charter** with its own change-log. Each new investment type gets its **own charter file** under `strategy/charters/`, and `sleeves.config.ts` routes each sleeve to its charter + rail block. The only thing all charters share is the safety envelope (below).
- **A sleeve bundles everything horizon-specific.** A sleeve = `{ id, horizon, mandate, universe, sizingModel, rails, redTeamLens, checklist, benchmark, cadence }`. Different horizons differ in **entry criteria, rails, sizing model, red-team lens, and cadence** — never in the safety envelope.
- **Per-sleeve rails sit *inside* a global real-money envelope that no sleeve can exceed.** The Phase-3 `LIVE_LIMITS` ceiling (account exposure cap, weekly funding cap, live drawdown kill switch in `lib/server/live-guards.ts`) is **cross-sleeve and unchanged** — adding sleeves can never increase total real-money exposure beyond it. The agent can never raise any sleeve rail or the envelope.
- **Long-term breaks "stop on every entry" — that is expected, and it is handled per-sleeve, not by loosening the swing rail.** The long-term/core sleeve sizes by **target allocation weight** and uses a **wide drawdown/review trigger** in place of a protective stop. The swing and mid sleeves still require a stop on every entry.
- **ETFs/indexes are a per-sleeve universe permission, not a global one.** SPY/VOO/QQQ stay **excluded from the swing sleeve** (still benchmark-only there) and become **permitted holdings only inside the sleeves that allow funds.**
- **Never merge two sleeves into one red-team.** As with trend vs value today, each sleeve is prosecuted under its **matching** lens, or none is enforced.
- **Still fully human-approved + two-gate-gated, per trade.** Every sleeve's approvable proposals flow the same `POST /api/live/approve` path; the gate, not the sleeve, is the real-money boundary. The agent never opens a gate, funds the account, or places an order without per-trade human approval. Not investment advice.

## The sleeve model (target end state)

| Sleeve id | Horizon | Mandate (entry thesis leads) | Universe | Sizing model | Stop | Benchmark |
|---|---|---|---|---|---|---|
| `swing-trend` | days–weeks | technical trend/momentum (today's default) | US equities, no funds | risk-to-stop (≤2%) | required (−8%/ATR) | SPY |
| `swing-value` | days–weeks | value/mean-reversion (today's value sleeve) | US equities, no funds | risk-to-stop (≤2%) | required | SPY |
| `position-mid` | weeks–quarters | trend + fundamental blend, earnings-in-window tolerated | US equities (+ optional sector ETF) | risk-to-stop, wider band | required (wider) | SPY |
| `core-long` | quarters–years | allocation / quality / valuation; counter-trend & no near-term catalyst are normal | US equities **+ ETFs/indexes** | **target allocation weight** | **none** — wide drawdown/review trigger | configurable (default SPY total return) |

`swing-trend` and `swing-value` are exactly today's `strategy: trend | value`, unchanged. `position-mid` and `core-long` are new and **opt-in** (off by default), each enabled deliberately like `valueSleeveEnabled`.

## Charter architecture — route, don't edit

The existing `strategy/charter.md` is the funded desk's immutable constitution. This work **never reopens it.** Instead, charters are **routed per sleeve**, with the genuinely-global safety envelope kept in one enforced place.

```
strategy/
  charter.md            ← SWING CHARTER — untouched, the existing file, its own change-log
  charter.config.ts     ← enforced rails (the real source of truth). Swing block UNCHANGED;
                          new per-sleeve rail blocks + LIVE_LIMITS (shared) added here.
  sleeves.config.ts     ← NEW. Routes each sleeve → its charter file + rail block + lens.
  charters/
    README.md           ← NEW. Shared "Inherited safety envelope" + cross-sleeve change-log.
    core-long.md        ← NEW. Long-term/core mandate + its own change-log.
    position-mid.md     ← NEW. Mid-term mandate + its own change-log.
```

Two rules make this safe:

- **The swing mandate lives only in `charter.md` — the file new-sleeve work never opens.** Swing rails, universe, and red-team lens cannot be touched by accident because no milestone here edits that file.
- **The shared safety envelope is referenced, never duplicated.** Its enforced source of truth is already `charter.config.ts` (`LIVE_LIMITS`: account exposure ceiling, weekly funding cap, live drawdown kill switch; the single shared `maxOrdersPerDay`; the two-gate + per-trade-approval model; the prohibited universe — options/crypto/futures/margin; "the agent never opens a gate or edits a charter"). Each new sleeve charter **opens with an "Inherited safety envelope (shared, non-negotiable)" header that links to these**, rather than copying the numbers (no drift). A sleeve can never define its own envelope.

So "where does a change-log entry go?" has a clean answer per change: a **swing** change → `charter.md` (but nothing here changes swing); a **per-sleeve mandate** change → that sleeve's charter (`charters/core-long.md` / `charters/position-mid.md`); a **cross-sleeve** change (framework, rails-routing, portfolio layer, tax, verdict matrix) → `charters/README.md`. The drafted entries at the end of this spec are labeled with their target file.

---

## M1 — `feature/sleeve-framework` — promote `strategy` into a first-class sleeve (no behavior change)

Pure generalization + data-model groundwork. **Zero behavioral change to the swing desk** — this milestone is "do no harm."

- **Schema.** Add a **`sleeve`** field to `TradeProposalSchema` (`src/lib/schemas.ts`) — `swing-trend | swing-value | position-mid | core-long`, plus a derived **`horizon`** (`swing | mid | long`). Keep the existing `strategy` field and **map it for back-compat**: `trend → swing-trend`, `value → swing-value`, and a null/legacy record reads as `swing-trend`. Default `sleeve = swing-trend`. Document in `.agents/data-format.md` (new "Proposal `sleeve` / `horizon`" section, mirroring the `strategy` section).
- **Sleeve registry + charter routing.** Add `strategy/sleeves.config.ts` (a sibling of `charter.config.ts`) defining each sleeve's `{ id, horizon, mandate, charterPath, universeId, sizingModel, railsId, redTeamLensId, checklistId, benchmark, cadence }`. The **`charterPath`** routes each sleeve to its charter file: the swing sleeves point at the **untouched** `strategy/charter.md`; `position-mid` / `core-long` point at their (not-yet-created) `strategy/charters/*.md`. For M1, `position-mid` and `core-long` are **declared but disabled**; only the two swing sleeves are active and resolve to **today's exact rails/universe/lens**. Tripwire test (`sleeves-config.test.ts`) asserts the swing sleeves map to the unchanged `RISK_LIMITS` and to `charter.md`.
- **Charter scaffolding (no swing edit).** Create `strategy/charters/README.md` — the shared "Inherited safety envelope" header (linking the `charter.config.ts` global caps) + a cross-sleeve change-log. **`strategy/charter.md` is not modified in this milestone or any other in this spec.**
- **Resolve points become sleeve-aware (but identical for swing).** Thread the sleeve through `buildChecklist` (`src/lib/checklist.ts`), `buildProsecutorPrompt` (`src/lib/server/red-team.ts`), `strategy-style.ts` (badge), and the proposal lens machinery (`src/lib/proposal-lens.ts`) — each branches on `sleeve` but for the two swing sleeves returns **byte-identical** output to today.
- **UI — proposal badge.** The proposal badge shows the sleeve (extend `strategy-style.ts`); add a `horizon` chip. No new sleeves are selectable yet.
- **UI — Strategy page (`/strategy`) becomes charter-aware.** Today the page is a hardcoded two-doc allowlist (`STRATEGY_DOCS = ["charter", "playbook"]` in `src/lib/server/strategy.ts`, mapped in `src/app/strategy/page.tsx`). Generalize it so it **lists every charter from `sleeves.config.ts` plus the shared docs** — no more hardcoded pair:
  - **Make the allowlist data-driven, keep the path-traversal guard.** Replace the flat `STRATEGY_DOCS` with a registry derived from `sleeves.config.ts` `charterPath` values + the shared docs (`playbook`, `charters/README.md`). `resolve()` currently flat-joins `strategy/<doc>.md`; extend it to allow the **explicitly-registered nested paths** (`charters/core-long.md`, etc.) and **reject anything not in the registry** (no arbitrary nesting — the traversal guard stays). Files that don't exist yet read as `""` (the lib already returns `""` on `ENOENT`), so a registered-but-not-yet-created charter simply shows empty until its milestone lands.
  - **Group + label in the UI.** Render the docs grouped: **Charters** (Swing → `charter.md`, then each enabled/declared sleeve → its file, then the shared **Safety envelope** → `charters/README.md`) and **Playbook**. Each charter row shows its **sleeve id + horizon + enabled/disabled** state (read from `sleeves.config.ts`), so you can see at a glance which investment types exist and which are live.
  - **Editing rules unchanged.** The existing human-edit/save flow (`saveStrategyDoc` server action) extends to the new docs via the same allowlist; the agent still never writes a charter. Mark `charter.md` (swing) and the new sleeve charters as human-only constitution; the shared envelope header in `README.md` is documentation of the enforced `charter.config.ts` caps (editing prose there never changes enforcement).
  - At M1 the page shows **Swing charter + Playbook + Safety-envelope README** (and the two new sleeves listed as *declared/disabled* with empty bodies). **`core-long.md` and `position-mid.md` bodies fill in at M3 / M4** automatically — no further page change needed.
- **Change-log.** The sleeve-framework entry goes in **`charters/README.md`** (cross-sleeve), **not** in `charter.md`. (Draft entry text at the end of this spec.)
- **Acceptance:** every existing swing proposal/test behaves identically; `strategy` legacy values map correctly; the sleeve registry resolves the two swing sleeves to today's rails/universe/lens and routes them to `charter.md`; new sleeves are declared but inert; `charter.md` is byte-unchanged (verify with `git diff`); the `/strategy` page lists Swing charter + Playbook + Safety-envelope README (and the two declared/disabled sleeves) instead of the hardcoded pair, each labeled with sleeve + horizon + enabled state, with the path-traversal guard preserved (a non-registered path is rejected); data-format doc + `charters/README.md` updated in the same PR; full test suite green.

## M2 — `feature/per-sleeve-rails-and-sizing` — sleeve-aware risk engine + target-weight sizing

Make the risk engine resolve rails **by sleeve**, and add a second sizing model — **without changing the swing numbers.** This is the highest-care milestone because it touches the engine guarding real money.

- **Per-sleeve rails.** Refactor the risk engine (`src/lib/risk/`) so rails are resolved from the sleeve's `railsId` rather than one global `RISK_LIMITS` block. The **swing rails are byte-identical** (`perPositionRiskPct 0.02`, `perPositionSizePct 0.2`, `maxSectorWeightPct 0.4`, `maxConcurrentPositions 5`, `maxOrdersPerDay 6`, drawdown halt, emergency stop, marketable-limit) and stay tripwire-tested in `charter-config.test.ts`. Add new rail blocks in `charter.config.ts` for `position-mid` and `core-long`.
- **`maxOrdersPerDay` stays a single global rail across all sleeves.** Adding sleeves must **not** multiply the daily order budget. Keep the 6/day cap as one shared counter (`order-counter.json`), enforced regardless of sleeve.
- **Two sizing models.** Generalize sizing into `sizingModel`:
  - **`risk-to-stop`** (today's model) — size from stop distance + ≤2% risk (`resolveStopPrice`, `lib/risk`). Used by `swing-*` and `position-mid`.
  - **`target-weight`** (new) — size from a **target portfolio weight** for the position (e.g. core ETF = X% of the portfolio), bounded by the per-sleeve `perPositionSizePct` and the global live exposure envelope. No stop distance required.
- **Stop becomes a sleeve property.** Add `requiresStop` to the sleeve config: `true` for `swing-*` and `position-mid` (a stopless entry is still **rejected and journaled** there, unchanged), `false` for `core-long`. For a `requiresStop: false` sleeve, the engine validates a **drawdown/review trigger** instead (a wide position-level drawdown that flags a human review, not an auto-exit).
- **Global envelope unchanged.** `LIVE_LIMITS` (`lib/server/live-guards.ts`) — account exposure ceiling, weekly funding cap, live drawdown kill switch — stays **cross-sleeve**; an order in any sleeve that would breach it is rejected and journaled. The agent can never raise it.
- **Change-log → `charters/README.md`** (cross-sleeve; `charter.md` untouched): rails are now **resolved per sleeve**; the swing numbers are unchanged; document the new sleeves' rail blocks, the `target-weight` sizing model, and the `requiresStop` property; restate that the live envelope is unchanged and cross-sleeve.
- **Acceptance:** swing sizing/rails are provably unchanged (regression tests on the existing fixtures); a `target-weight` core position sizes correctly and carries **no** stop; a stopless swing/mid entry is still rejected; the 6-order/day cap and the live exposure envelope bind across all sleeves; tripwire tests cover every new rail number.

## M3 — `feature/core-long-sleeve` — long-term / core sleeve (ETF + index allowing)

The concrete buy-and-hold sleeve and the first new horizon. **Opt-in**, full gated order path (human-approved, per trade).

- **Universe.** `core-long` permits **ETFs and index funds** (`allowedAssetClasses += etf/fund`) and **does not exclude SPY/VOO/QQQ** — they are permitted core holdings here (still benchmark-only in the swing sleeves). Liquidity floor still applies; the ATR volatility cap does **not** gate broad ETFs.
- **Entry criteria + its own checklist.** Long-term theses lead on **allocation fit, business (or fund) quality, and valuation (or expense ratio)**, not technical setups. The checklist reframes for buy-and-hold: target weight & allocation fit, quality (durable business or low-cost diversified fund), valuation vs long-term history (not a near-term setup), and a **drawdown/review trigger** in place of a stop. The breakout-volume and catalyst-timing items are **dropped** (counter-trend and "no near-term catalyst" are normal here, not strikes — the value-sleeve precedent).
- **Its own red-team lens.** Brief the prosecutor (`buildProsecutorPrompt`, `src/lib/server/red-team.ts`) with the **core-long mandate**: it must **not** reject for counter-trend or absent near-term catalyst. It instead prosecutes: **overpaying vs long-term value, thesis drift / story stock, over-concentration vs the target allocation, fund quality (expense ratio, tracking error, structure) for ETFs, and an unrealistic long-term return assumption.** Never merged with the trend/value/mid lenses.
- **Sizing.** `target-weight` (from M2) — sized to a target portfolio weight, bounded by the sleeve's `perPositionSizePct` and the global live envelope. No protective stop.
- **Benchmark.** Configurable per sleeve; default **SPY total return** for `core-long` (a core book that *is* roughly the index should be measured against it honestly).
- **Where core-long proposals come from.** A manual **analyze-a-symbol sleeve picker** (extend the existing lens picker, `POST /api/proposals/analyze`) and, when enabled, a sleeve-aware discovery bucket (allocation-gap driven, not setup-driven — see M5 cadence). Enabled by a `coreLongSleeveEnabled` discovery setting (off by default), mirroring `valueSleeveEnabled` in `data/control/discovery-settings.json`.
- **Execution.** Approvable `core-long` proposals flow the **same two-gate, per-trade-approval path** as today (`POST /api/live/approve`; gate closed → dry-run sink, open → Robinhood). No new execution surface, no auto-trade.
- **Charter file → `strategy/charters/core-long.md`** (new, its own change-log; `charter.md` untouched). It opens with the shared **"Inherited safety envelope"** header, then states the core-long mandate: universe (ETF/index allowed, SPY not excluded *for this sleeve only*), target-weight sizing, no-stop + drawdown/review trigger, and its red-team lens. `sleeves.config.ts` already routes `core-long` here (M1). The swing universe (no funds, SPY excluded) is in `charter.md` and is explicitly unchanged.
- **Acceptance:** a core ETF (e.g. VOO) can be analyzed and proposed under `core-long`, sized by target weight, carrying no stop but a drawdown/review trigger; it is **not** rejected for being counter-trend or catalyst-free; an overpriced/over-concentrated/high-expense-ratio pick **is** flagged by the core-long red-team; SPY is still rejected as a swing holding; the sleeve is off by default; execution stays fully gated; its charter (`charters/core-long.md`) surfaces on the `/strategy` page automatically (registered in M1); tested for the new lens + sizing.

## M4 — `feature/position-mid-sleeve` — mid-term / position sleeve

The middle horizon: weeks-to-quarters position trades that blend trend with fundamentals. **Opt-in.**

- **Entry criteria + checklist.** Trend still matters, but a **named fundamental thesis is allowed to lead** and an **earnings event inside the (longer) holding window is tolerated** rather than auto-disqualifying as it is for swing. Wider profit targets and review dates.
- **Rails.** From M2's `position-mid` block: a **wider stop band** than swing, a longer expected hold, and (optionally) a slightly larger `perPositionSizePct` — all still inside the global live envelope, still `requiresStop: true`. Numbers tripwire-tested.
- **Red-team lens.** A `position-mid` mandate: expects a multi-week thesis, does **not** punish the absence of an immediate momentum trigger, but still prosecutes a broken trend, a deteriorating fundamental story, an imminent binary that exceeds the risk, or a loose target.
- **Sources + execution.** Manual analyze sleeve picker + optional sleeve-aware discovery; same gated approval path; off by default (`positionMidSleeveEnabled`).
- **Charter file → `strategy/charters/position-mid.md`** (new, its own change-log; `charter.md` untouched). Opens with the shared **"Inherited safety envelope"** header, then the position-mid mandate and its wider-stop rail block. `sleeves.config.ts` already routes `position-mid` here (M1). Swing/core charters unchanged.
- **Acceptance:** a mid-term thesis with an earnings event inside the window is judged under the mid lens (not auto-rejected as swing would), carries a wider stop, sizes within its rails and the global envelope; a broken-trend / deteriorating-story mid pick is flagged; off by default; its charter (`charters/position-mid.md`) surfaces on the `/strategy` page automatically (registered in M1); tested.

## M5 — `feature/portfolio-allocation-and-rebalancing` — the portfolio-manager layer

The payoff that turns "several sleeves" into "a managed portfolio." This layer sits **above** the sleeves.

- **Target allocation across sleeves.** A human-set target mix (e.g. `core-long 60% / position-mid 25% / swing 15%`), persisted in `data/control/allocation-targets.json` (new `AllocationTargetsSchema`), editable from a new **Portfolio** view / the Risk-settings page. The agent can read and propose against it but never edits it (charter-style discipline).
- **Drift tracking + rebalancing proposals.** Compute current vs target weights (per sleeve and per holding) from the active-mode snapshots; when drift exceeds a band, generate **rebalancing proposals** (trim the overweight sleeve, add to the underweight) that flow the **normal gated approval path**. **Reuse the staged-entry/tranche machinery** (`src/lib/staged-entry.ts`) for scaling into target weights over tranches rather than one block order — each tranche a separate gated approval, as today.
- **Sleeve-scoped + blended measurement.** Extend the existing account-scoping pattern (`getEvaluationScorecard` / `buildLiveBookPerformance`) to be **sleeve-scoped**: per-sleeve performance vs that sleeve's benchmark, plus a **blended portfolio** view vs a configurable blended benchmark. No bleed between sleeves' stats (the same discipline that keeps paper/live separate today).
- **Cadence.** Add a **rebalance-review routine** (monthly/quarterly) distinct from the daily swing routines — long-term/core does **not** want a daily idea hunt. Make discovery sleeve-aware: swing discovery hunts setups; core/mid "discovery" surfaces **allocation gaps and quality candidates**, not momentum setups. Bound by the same review-funnel caps (`DISCOVERY_LIMITS`).
- **Portfolio view (UI).** A new top-level view: target vs current allocation, per-sleeve drift, blended and per-sleeve performance vs benchmark, and any pending rebalancing proposals. Follows the existing design system (`tabular-nums`, gain/loss tokens, light+dark, a11y).
- **Acceptance:** a target allocation is set and persisted (agent can't edit it); drift past the band produces gated rebalancing proposals using the tranche machinery; per-sleeve and blended performance render without cross-sleeve bleed; the rebalance routine runs on its own cadence; discovery is sleeve-appropriate; Portfolio view ships in both themes; tested.

## M6 — `feature/tax-lot-awareness` — holding-period & wash-sale surfacing

Once "long-term" is a goal, tax treatment matters. **v1 scope = surfacing + warnings, not full lot-selection optimization.**

- **Holding period + LT/ST split.** Surface days-held per lot and the **long-term line (365 days)**; show an **unrealized long-term vs short-term gain split** on the Portfolio/Positions views, sourced from the snapshots' cost-basis/acquisition data.
- **Wash-sale warning.** On a **sell proposal that realizes a loss**, flag any **repurchase of the same/substantially-identical security within 30 days** (and the reverse) as a wash-sale warning on the proposal card — a **surfaced caution, not a hard block** (consistent with how weak catalysts/targets are flagged, not gated).
- **Sell-lens hint.** When a `core-long`/`position-mid` sell would convert a nearly-long-term gain to short-term, surface that as a review note. **No automated lot selection in v1** — inform the human, don't optimize for them.
- **Acceptance:** holding period + LT/ST split render from snapshot data; a loss-sale-then-rebuy-within-30-days is flagged on the proposal; a near-LT sell is noted; nothing is hard-blocked by tax logic; tested. (Lot-selection optimization explicitly deferred.)

## M7 — `feature/multi-sleeve-verdict-matrix` — one proposal, every sleeve's pass/fail

A symbol often qualifies (or fails) differently depending on the lens — strong as a long-term core hold but a weak swing setup, or a clean trend entry that fails the value test. The owner wants to **review all of that on a single proposal**: a per-sleeve **pass / fail** verdict so every aspect is visible at once, not split across separate proposals. This generalizes the existing **dual-lens** evaluation (trend + value on a manual analyze, each carrying its own red-team verdict in the `lenses` array) from two lenses to **N sleeve-lenses**.

- **Multi-lens evaluation.** Extend the dual-lens pipeline (`src/lib/proposal-lens.ts`, the `lenses: ProposalLensSchema[]` array, `buildProposalLenses`, `resolveActiveLens`) so a manual analyze can evaluate a symbol under **every enabled sleeve** the human selects — each lens runs its **own checklist + own red-team** and stores its own per-lens verdict, levels, sizing, catalyst, and conviction (the schema already carries this per lens). Research is still fetched **once** and shared across lenses (respects the Perplexity cap, as the dual-lens pipeline does today).
- **Verdict matrix UI.** On the proposal detail view, render a compact **sleeve × verdict matrix** — one row per evaluated sleeve (`swing-trend`, `swing-value`, `position-mid`, `core-long`), each showing its red-team **pass/concern/fail** pill plus its key levels (entry/stop-or-target-weight/target) and conviction. The existing semantic verdict pills + the Trend/Value toggle generalize into this matrix; keep a glanceable summary line ("core-long ✓ · swing-trend ✗ · swing-value concern").
- **Acting lens at approval is explicit and unchanged in spirit.** The human still approves **one sleeve's** version of the trade (`resolveActiveLens` → that lens's levels/sizing/red-team drive the order; the journal records a `sleeve:<id>` tag). The matrix is for **review**; approval remains single-sleeve, single-trade, fully gated. A sleeve whose red-team **fails** is shown failed in the matrix and can't be the acting lens without the existing logged human override.
- **Honest "not evaluated" state.** A sleeve the human didn't select (or that's disabled) renders as **not evaluated**, never a fake pass — same discipline as the `none`/`unavailable` catalyst states.
- **Discovery stays single-sleeve.** Autonomous discovery candidates remain single-lens (one sleeve per candidate, as discovery is today); the matrix is a **manual analyze-a-symbol** feature where the human asks "how does this name look across horizons?"
- **Acceptance:** a manually analyzed symbol shows per-sleeve pass/fail for every selected sleeve in one proposal, each from its own checklist + red-team; research is fetched once; approval still acts on exactly one sleeve and stays gated; unselected sleeves show "not evaluated"; the active lens drives the order + journal tag; tested across ≥3 sleeves.

## Hard guardrails (non-negotiable, across every milestone)

- **`strategy/charter.md` is not edited by any milestone in this spec.** It stays the swing charter, byte-unchanged (verify with `git diff strategy/charter.md` → empty). New mandates live in `strategy/charters/*.md`; cross-sleeve notes live in `strategy/charters/README.md`; routing lives in `sleeves.config.ts`.
- The swing sleeves' rails, universe, and red-team lenses are **byte-identical** to today and stay tripwire-tested. No milestone weakens a swing guard.
- The **global live envelope** (`LIVE_LIMITS`: account exposure ceiling, weekly funding cap, live drawdown kill switch) is **cross-sleeve and unchanged**; no sleeve can exceed it; the agent can never raise it.
- The **6-order/day** cap stays a single shared counter across all sleeves — more sleeves never means more daily orders.
- Every sleeve's approvable proposals flow the **same two-gate, per-trade-approval** path. The agent never opens a gate, funds the account, or places an order without explicit per-trade human approval. The app never auto-trades; hands-off automation stays gated on the Phase 2 scorecard (advisory only).
- New sleeves (`position-mid`, `core-long`) ship **disabled by default**, enabled deliberately like `valueSleeveEnabled`.
- Two sleeves are never merged into one red-team. Not investment advice.

## Out of scope

- Options, crypto, futures, margin (unchanged charter universe).
- Opening the order gate / hands-off automated real-money execution without per-trade approval (still gated on the Phase 2 scorecard).
- Full tax-lot **optimization** / automated lot selection (M6 surfaces and warns only).
- Any change to the swing sleeves' rails, universe, sizing, or red-team lenses.

---

## Draft change-log entries (one per milestone, routed to the right file)

Ready-to-paste change-log entries. **None of these go in `strategy/charter.md`** — the
swing charter is not touched. Each entry's heading names its **target file**:
cross-sleeve entries → `strategy/charters/README.md`; per-sleeve mandate entries → that
sleeve's charter. Logs are newest-first (prepended). The **date shown is the
spec-authoring date (2026-06-28)** — set each entry's date to the day its branch merges.
Each milestone adds its entry in the **same PR** as the code, per the self-correction
mandate in `AGENTS.md`.

### M1 — sleeve framework → `strategy/charters/README.md`

> **2026-06-28 — Sleeve model: style × horizon (sleeve-framework M1).** Promoted the
> per-proposal **`strategy`** (`trend | value`) into a first-class **`sleeve`** with a
> **`horizon`** (`swing | mid | long`). The existing mandates become
> **`swing-trend`** (default) and **`swing-value`** sleeves with **byte-identical
> rails, universe, sizing, and red-team lenses** — no swing behavior changed; the
> `charter.config.ts` swing rail numbers are untouched and stay tripwire-tested.
> Declared (disabled) two new horizons for later milestones: **`position-mid`**
> (weeks–quarters) and **`core-long`** (quarters–years, **ETF/index-allowing**,
> **target-weight sizing**, **no protective stop** — a wide drawdown/review trigger
> instead). A sleeve bundles `{ horizon, mandate, universe, sizingModel, rails,
> redTeamLens, checklist, benchmark, cadence }`; sleeves differ only in entry
> criteria, rails, sizing, lens, and cadence — **never in the real-money envelope**.
> The Phase-3 `LIVE_LIMITS` ceiling and the 6-order/day cap remain **cross-sleeve and
> unchanged**, and the two-gate + per-trade-approval safety model is unchanged. New
> sleeves are **opt-in** (off by default), like the value sleeve. Rationale: extend
> the same governed pipeline from a single swing mandate to a multi-horizon portfolio
> manager without weakening any guard. See `planning/portfolio-sleeves-and-horizons-spec.md`.

### M2 — per-sleeve rails + target-weight sizing → `strategy/charters/README.md`

> **2026-06-28 — Rails resolved per sleeve + target-weight sizing (per-sleeve-rails M2).**
> The risk engine (`src/lib/risk/`) now resolves rails from the proposal's **sleeve**
> rather than one global block. The **swing rails are byte-identical** to before
> (`perPositionRiskPct 0.02`, `perPositionSizePct 0.2`, `maxSectorWeightPct 0.4`,
> `maxConcurrentPositions 5`, drawdown halt, emergency stop, marketable-limit) and
> stay tripwire-tested in `charter-config.test.ts`; new rail blocks were added for
> `position-mid` and `core-long`. Added a second **sizing model** — **`target-weight`**
> (size to a target portfolio weight, bounded by the sleeve's size cap and the global
> live envelope) alongside the existing **`risk-to-stop`** model — and made the stop a
> **sleeve property** (`requiresStop`): `true` for `swing-*` and `position-mid` (a
> stopless entry is still rejected and journaled there), `false` for `core-long` (a
> wide drawdown/review trigger replaces the stop). **No safety envelope changed:** the
> **`maxOrdersPerDay 6`** cap stays one shared counter across all sleeves, and the
> Phase-3 `LIVE_LIMITS` exposure ceiling / weekly funding cap / live drawdown kill
> switch (`lib/server/live-guards.ts`) stay **cross-sleeve and unchanged**; the agent
> can never raise any rail or the envelope. Rationale: different horizons need
> different entry rails and sizing, but the real-money envelope must bind them all
> equally. See `planning/portfolio-sleeves-and-horizons-spec.md`.

### M3 — core-long sleeve (ETF/index) → `strategy/charters/core-long.md`

> **2026-06-28 — Long-term / core sleeve authorized (core-long M3).** Enabled the
> **`core-long`** sleeve (quarters–years), the first new horizon and the **one
> deliberate exception** to "US single names, stop on every entry, SPY never a
> holding": for **this sleeve only**, the universe permits **ETFs and index funds**
> and **does not exclude SPY/VOO/QQQ** (they are permitted core holdings here; they
> remain benchmark-only and excluded in the swing sleeves). Core-long positions are
> sized by **target allocation weight** (no risk-to-stop math) and carry **no
> protective stop** — a **wide drawdown/review trigger** stands in. Its **own
> red-team lens** must NOT reject for counter-trend or absent near-term catalyst
> (both normal long-term); it instead prosecutes overpaying vs long-term value,
> thesis drift, over-concentration vs target allocation, fund quality (expense ratio /
> tracking error / structure) for ETFs, and unrealistic long-term return assumptions —
> never merged with the trend/value/mid lenses. Its checklist drops the
> breakout-volume and catalyst-timing items. **Opt-in** (`coreLongSleeveEnabled`, off
> by default). **No shared guard changed:** swing universe (no funds, SPY excluded) is
> untouched; the 6-order/day cap and the live envelope still bind; execution stays the
> same two-gate, per-trade-approved, gate-closed-→-dry-run path. Rationale: run a
> governed long-term/index book through the same pipeline without contorting the swing
> mandate. See `planning/portfolio-sleeves-and-horizons-spec.md`.

### M4 — position-mid sleeve → `strategy/charters/position-mid.md`

> **2026-06-28 — Mid-term / position sleeve authorized (position-mid M4).** Enabled
> the **`position-mid`** sleeve (weeks–quarters). A **named fundamental thesis is
> allowed to lead** and an **earnings event inside the holding window is tolerated**
> (not the auto-disqualifier it is for swing); profit targets and review dates are
> longer-dated. It uses the M2 `position-mid` rail block — a **wider stop band** than
> swing, longer expected hold, optionally a slightly larger per-position size cap — all
> still **`requiresStop: true`**, all inside the global live envelope, all
> tripwire-tested. Its **own red-team lens** expects a multi-week thesis, does not
> punish the absence of an immediate momentum trigger, but still prosecutes a broken
> trend, a deteriorating fundamental story, an imminent binary that exceeds the risk,
> or a loose target — never merged with the other lenses. **Opt-in**
> (`positionMidSleeveEnabled`, off by default). Swing and core sleeves unchanged; the
> 6-order/day cap and live envelope still bind; execution path unchanged. Rationale: a
> middle horizon between days-to-weeks swings and multi-year core holds, governed by
> the same pipeline. See `planning/portfolio-sleeves-and-horizons-spec.md`.

### M5 — portfolio allocation + rebalancing → `strategy/charters/README.md`

> **2026-06-28 — Portfolio allocation & rebalancing layer (portfolio M5).** Added a
> portfolio-management layer **above** the sleeves: a human-set **target allocation
> across sleeves** (`data/control/allocation-targets.json`), which the **agent reads
> and proposes against but never edits** (charter-style discipline, like the rails and
> the charter itself). Drift past a band generates **rebalancing proposals** (trim the
> overweight sleeve, add to the underweight) that flow the **normal gated, per-trade-
> approved path** and reuse the staged-entry tranche machinery (each tranche a separate
> approval). Performance measurement is now **sleeve-scoped** (each sleeve vs its own
> benchmark) plus a **blended portfolio** view vs a configurable blended benchmark,
> with no cross-sleeve bleed (the same isolation that keeps paper/live stats separate).
> Added a **rebalance-review routine** on a monthly/quarterly cadence distinct from the
> daily swing routines, and made discovery **sleeve-appropriate** (swing hunts setups;
> core/mid surface allocation gaps and quality candidates) — still bounded by the
> existing `DISCOVERY_LIMITS` review-funnel caps. **No safety guard changed:** the
> 6-order/day cap, the live exposure envelope, and the two-gate + per-trade-approval
> model all still bind; rebalancing never auto-executes. Rationale: turn several
> sleeves into one managed portfolio with explicit, human-owned target weights.
> See `planning/portfolio-sleeves-and-horizons-spec.md`.

### M6 — tax-lot & holding-period awareness → `strategy/charters/README.md`

> **2026-06-28 — Tax-lot & holding-period surfacing (tax-awareness M6, advisory).**
> Surfaced tax context for the longer-horizon book: per-lot **holding period** with the
> **long-term line (365 days)**, an **unrealized long-term vs short-term gain split** on
> the Portfolio/Positions views, and a **wash-sale warning** on any sell proposal that
> realizes a loss with a same/substantially-identical repurchase inside 30 days (and the
> reverse). A near-long-term sell that would lock a short-term gain is flagged as a
> review note. **All of this is surfaced caution, never a hard block** — consistent with
> how weak catalysts/targets are flagged, not gated — and there is **no automated lot
> selection** (deferred). No rail, gate, sizing, or red-team change; advisory only.
> Rationale: once "long-term" is a goal, the human needs holding-period and wash-sale
> visibility to decide well — without the desk optimizing taxes on their behalf.
> See `planning/portfolio-sleeves-and-horizons-spec.md`.

### M7 — multi-sleeve verdict matrix → `strategy/charters/README.md`

> **2026-06-28 — Multi-sleeve verdict matrix on one proposal (verdict-matrix M7).**
> Generalized the existing **dual-lens** evaluation (trend + value, each with its own
> red-team verdict in the `lenses` array) to **N sleeve-lenses**: a manually analyzed
> symbol can now be evaluated under **every enabled sleeve the human selects**, each
> running its **own checklist + own red-team** and storing its own per-lens verdict,
> levels, sizing, and conviction — research fetched **once** and shared (respects the
> Perplexity cap). The proposal detail view renders a **sleeve × pass/fail matrix** so
> every aspect is reviewable in one place; a sleeve the human didn't select shows
> **"not evaluated," never a fake pass.** **Approval is unchanged in substance:** the
> human still approves **exactly one sleeve's** version of the trade
> (`resolveActiveLens` drives the order; the journal records a `sleeve:<id>` tag), a
> failing-red-team sleeve still needs the existing logged override to act, and
> autonomous discovery stays single-sleeve. The matrix is a **review aid**, not a new
> execution path; no rail, gate, or envelope changed. Rationale: a name can be a strong
> long-term core hold but a weak swing setup — show all of it on one proposal so the
> human reviews every aspect at once. See `planning/portfolio-sleeves-and-horizons-spec.md`.
