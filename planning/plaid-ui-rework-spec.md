# Build Spec — Plaid-style UI rework (de-densify + modernize)

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/design-system.md`, `.agents/nextjs.md` first. A whole-app visual rework toward the Plaid aesthetic, source `ihlamury/design-skills/skills/plaid`. The core goal is **less density / more breathing room**, not just new colors. Each milestone = its own branch + PR. No logic/data/gate changes — presentation only._

## Source caveat (important — the scraped Plaid tokens are broken)
The Plaid skill's "semantic tokens" table lists **dark text colors** (`text-primary #40645C`) that are invisible on its own `#1B1B1B` background, and a saturated blue (`#1376C1`) mislabeled as the card surface. Use the **corrected** tokens below, not the skill's raw table. Keep the skill's real *character*: dark-first, Inter, generous spacing, big rounded corners (18–32px), reduced palette, confident hierarchy. Scale its marketing-size type (72/23px) down to app sizes.

## Decisions (locked)
- **Accent = Plaid soft-blue `#7FB4D5`.** **Remove the lime `#B7DF2F` entirely**, app-wide — not just as the accent, but anywhere it appears incidentally. No lime survives.
- **Dark-first** is the primary, showcase theme. Keep light mode working (it inherits the tokens) but treat dark as the reference design.
- **The symbol chart stays as-is** (the one piece the owner likes) — restyle only its surrounding surface to match.

## Owner's goals for this rework (the bar to clear)
1. Better color palette — give the Plaid system a real shot (blue accent + restrained neutrals + gain/loss only).
2. **Easier, consistent iconography** — one icon library, consistent size/stroke/semantics (see M6).
3. Better visuals for **charts, KPIs, and content handling** — data should look intentional, not dumped.
4. **Nicer font blending between headlines and content** — a clear but harmonious Inter hierarchy (see Typography).
5. Better, more modern **flow of page content/data** — group, sequence, and progressively disclose; kill the walls of data.

## Design tone — the taste that governs all of this (Mercury-grade restraint)
Two pulls are in tension: the fintech patterns below (richer) and Mercury (calmer). **Resolve toward Mercury.** The target is *premium, calm, "nonsense-free" clarity* — not a busy dashboard.
- **When in doubt, remove.** Whitespace and typography do the heavy lifting; decoration is the exception.
- **One sophisticated accent** (the Plaid blue), used as precision — for the one thing that matters on a screen, not everywhere. Gain/loss semantic colors + neutrals otherwise.
- **Quiet, confident type.** Clear hierarchy through size/weight/color, never competing styles or loud color.
- **Tasteful, understated data-viz.** Thin axes, restrained gridlines, calm. No flashy chrome.
- A screen should feel like it has *less* on it than the data warrants — that's the goal, given the current "too dense" problem.

## Corrected token system (write this into `.agents/design-system.md`, replacing the old palette)

### Dark mode (primary)
| Token | Hex | Use |
|---|---|---|
| surface-base | #1B1B1B | page background |
| surface-raised | #242426 | cards |
| surface-overlay | #2E2E32 | modals, popovers |
| border-default | #373D3E | dividers, card borders |
| text-primary | #EAEEF2 | headings/body |
| text-secondary | #9E9E9F | muted |
| text-tertiary | #6E7174 | hints |
| accent | #7FB4D5 | actions, links, focus (black text on fill) |
| accent-hover | #98C6E0 | hover |

### Light mode (Plaid character on light, if kept)
| Token | Hex |
|---|---|
| surface-base | #FFFFFF |
| surface-raised | #F7F7F8 |
| surface-overlay | #FFFFFF (+shadow) |
| border-default | #E6E6E8 |
| text-primary | #1B1B1B |
| text-secondary | #5F5E5A |
| accent | #2F7DB0 (deeper blue for contrast on white) |

### Trading semantics (dark / light) — preserved, tuned for dark legibility
| Token | Dark | Light |
|---|---|---|
| gain | #22C55E | #00A301 |
| loss | #FF6B3D | #E03A00 |

### Foundations
- **Inter** throughout; `tabular-nums` on all numbers; `text-balance` headings, `text-pretty` body. Weights: 400 / 500 / 600 only.
- **Type scale (app, not marketing) + headline↔body blending (goal 4):** page title ~24px/600, section heading ~18px/600, KPI number ~28–32px/600, body 14–15px/400, label 12px/500 in `text-secondary`. Never the skill's 72/23px. Headlines and content should feel like one family: differentiate by **size + weight + color** (primary vs secondary), not by competing styles; consistent line-height (~1.5 body), generous heading margins so sections read as distinct.
- **Iconography (goal 2):** standardize on **one** icon library already in the app (e.g. lucide-react) — pick it, remove any others. Consistent stroke width, a single default size (~16–18px inline, 20px for nav), `currentColor` so icons inherit token colors, a documented semantic map (gain ↑, loss ↓, alert, gate, etc.), and `aria-label` on icon-only buttons. Don't mix icon sets or hand-draw SVGs.
- **Charts & data-viz (goal 3):** style the equity curve, sparklines, R:R bar, earnings beat/miss strip, and KPI deltas to one consistent visual language — gain/loss semantic colors, the blue accent for neutral series, thin axes, `tabular-nums` labels, restrained gridlines. Data should look composed, not raw.
- **Spacing — the density fix:** 4px grid, but generous. Card padding 20–24px, section gaps 20–24px, real whitespace between groups. Err toward roomy.
- **Radii (Plaid-generous):** cards 18–20px, pills/badges 26px+, inputs ~14px. No tight corners.
- **Reduced palette:** blue accent + neutrals + gain/loss only. Remove incidental colors.
- Focus: 2px accent outline + 2px offset. Motion ≤200ms, transform/opacity only, respect reduced-motion. `AlertDialog` for destructive actions. `aria-label` on icon-only buttons. `h-dvh` not `h-screen`.

## Modern fintech patterns to adopt (from owner-provided references)
Inspiration only (Finance D, FiraCast, Monarch) — adopt the *patterns*, not the look. Keep Plaid's restraint.
- **Enriched KPI card:** small tinted rounded-square **icon** + muted label + **big number** + a compact **delta pill** (gain/loss tinted) + an optional **sparkline**. Use the **two-tone number** trick — de-emphasize the cents / secondary digits in `text-tertiary`.
- **Charts as first-class:** equity curve = area-fill line with a highlighted point + tooltip + crosshair (match the quality of the symbol chart the owner likes). Add a **composition ring/donut** for portfolio/sector mix with a legend grid. Single-highlight-bar pattern where one value matters.
- **Progress bars for every target:** guardrail headroom (drawdown vs −10%, orders X/6, positions X/5), the **evaluation window** (X/30 days), and live caps ($X/$100 funding, $X/$500 exposure). Track + accent/semantic fill, value label.
- **Grouped, icon-led lists:** entity icon + two-line label + right-aligned number + **status pill**, sectioned by date — for journal, news, positions.
- **Restraint rule:** blue accent + gain/loss + neutrals everywhere. A small **categorical** palette is allowed **only** for true composition charts (sector/portfolio). Do not color everything.

## Milestones

### M1 — `feature/plaid-design-tokens`
Rewrite `.agents/design-system.md` to the corrected system above; implement tokens as CSS variables (dark primary; light if kept) + the Tailwind theme; establish the spacing/radii/type scale globally. No per-component redesign yet — just the foundation + a verified contrast pass.
- **Acceptance:** tokens live; both themes (or dark-only) apply app-wide; ≥4.5:1 contrast everywhere; nothing visually broken.

### M2 — `feature/plaid-shell-and-kpis`
Restyle the app shell (sidebar + header + market-clock + mode toggle) and the **KPI** components using the **enriched KPI pattern**: tinted icon + muted label + big two-tone number + delta pill + optional sparkline. Also restyle the Overview **equity curve** (area-fill line + highlighted point + tooltip/crosshair, matching the symbol chart) and the **guardrail-headroom** progress bars.
- **Acceptance:** shell + enriched KPIs + equity curve + headroom bars match the direction; noticeably more breathing room; light + dark + a11y.

### M3 — `feature/plaid-proposals`
Rework the **proposal** cards (Overview "awaiting review" + Proposals view): roomy card, BUY/SELL pill, thesis, the R:R bar (kept), the **semantic** red-team verdict box, confidence meter, blue primary "Approve". Apply the same to the live-advisory + approvable variants and the approve/override dialog.
- **Acceptance:** proposals read cleanly with breathing room; red-team verdict is prominent and semantic; dialogs uncramped; light + dark + a11y.

### M4 — `feature/plaid-plans-and-research`
Restyle the **Evaluation gate / scorecard**, the **research summary** card, and **coaching/plans** surfaces — spacious cards, clear hierarchy, the verdict/headline prominent. Use a **progress bar** for the evaluation window (X/30 days) and the live caps; add a **composition ring** for portfolio/sector mix where relevant. Keep the symbol chart; restyle only its surrounding page surface to match.
- **Acceptance:** these pages are scannable, not dense walls; eval-window/caps render as progress bars; any composition uses the restrained categorical palette; symbol chart unchanged but its page matches.

### M5 — `feature/plaid-lists`
De-densify the dense list/table surfaces — **journal, positions, logs, news** — using the **grouped, icon-led list** pattern: entity icon + two-line label + right-aligned number + status pill, sectioned by date. More row padding, clear hierarchy; card-ify where a raw table is hard to digest.
- **Acceptance:** lists are readable at a glance, grouped and icon-led; no wall-of-table; light + dark + a11y.

### M6 — `feature/plaid-iconography`
Standardize iconography across the app: pick the single icon library, remove any others, normalize size/stroke/color (`currentColor`), apply the semantic map, and add `aria-label` to every icon-only control. Can run early (alongside M2) since later milestones consume it.
- **Acceptance:** one icon library; consistent sizing/stroke; icons inherit token colors; no mixed sets; icon-only buttons labelled.

### M7 — `feature/glossary-tooltips`
Modern, accessible **glossary tooltips** that explain jargon/acronyms throughout, built the smart way:
- **One central glossary** (a single module: `term → { label, definition, caveat? }`) — definitions live in one place, reused everywhere; never hardcode explanations inline.
- **One reusable component** (`<Term>` / `<InfoTip>`): renders the term with a subtle dotted underline + a small info dot; opens on **hover, focus, AND tap** (not hover-only). Popover shows the label, a 1–2 sentence plain-language definition, and an optional caveat line. Calm/Mercury-restrained styling.
- **Accessibility (required):** keyboard-focusable trigger, `role="tooltip"` + `aria-describedby` (or a button with `aria-expanded` for the click variant), dismiss on Esc/blur, never blocks text selection, works on touch, respects `prefers-reduced-motion`.
- **Restraint:** tag a term only on its **primary** appearance per view, and only genuinely jargony terms/acronyms — not every word. Mercury tone: helpful, not cluttered.
- **Caveats live here too:** model confidence (self-rated, uncalibrated), IEX feed (not the consolidated tape), Perplexity Finance (capped/metered), dry-run sink, advisory vs approvable — reuse existing honest copy.

**Seed glossary (extend as needed):**
- _Finance:_ R:R (reward÷risk, ≥2:1 required), ATR, drawdown / max drawdown, relative strength, swing trade, marketable-limit order, protective stop, take-profit, trailing stop, relative volume, P/E, EPS, market cap, SPY (benchmark, not held), excess return / alpha, Sharpe, profit factor, win rate, IEX feed.
- _System:_ paper vs live, dry-run sink, two-gate (broker gate / harness gate), red-team, advisory vs approvable proposal, discovery, tracked universe, dead-man switch, risk rails, emergency stop, drawdown halt, model confidence (uncalibrated), Perplexity Finance (capped), evaluation scorecard / advisory verdict.
- **Acceptance:** a central glossary + one accessible component; the seed terms are tagged on primary appearances; keyboard + touch + screen-reader accessible; not over-applied; light + dark.

## Out of scope
- Any data / logic / gate / execution change. The symbol chart's internals. Animations beyond subtle ≤200ms.
