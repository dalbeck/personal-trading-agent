# Design System

Plaid-style system (source skill `ihlamury/design-skills/skills/plaid`), with the skill's **mis-scraped tokens corrected**, marketing-scale typography reduced to app scale, a **light theme added** (the skill is dark-only), and **trading gain/loss colors added**. Implemented as CSS variables toggled by Tailwind's `dark` class (raw hexes live only in `src/app/globals.css`; components reference the mapped Tailwind tokens — `bg-surface`, `text-fg`, `text-gain`, `rounded-card`, … — never hardcoded values).

**Dark is the primary, reference theme.** Light mode is kept and inherits the same tokens, but dark is the showcase the design is judged against.

## Design tone — structured richness, not austerity (governs everything)
The target is *premium, calm clarity* — beauty from **structured visual richness + clear hierarchy**, not from stripping color away. **Restraint means avoiding clutter, NOT avoiding color, gradients, or a serif face.** (Recalibration from the first pass, which over-indexed on austerity and read as flat/mundane.)
- **Density is fixed by hierarchy + whitespace, not by removing elements:** one clear focal point per page, big gaps between sections, fewer things per zone, progressive disclosure of detail.
- **One focal point per page — a gradient HERO** (subtle accent gradient + soft glow + faint dot-grid + the big number) anchors each main page (`HeroCard` / `surface-hero` / `bg-dot-grid`). Build the rhythm hero → flatter secondary cards; **avoid the uniform grid** that reads as mundane.
- **Richness is allowed, used with structure:** accent-tinted header **strips** on section/card headers (`tint-strip`) to break up the grid; subtle patterns/textures **only** behind a hero or as a highlighted-bar fill — **never a whole-page background**.
- **One sophisticated accent** (the Plaid blue) carries the gradients, glow, and tints; gain/loss semantics + neutrals otherwise. Color with intent, not everywhere.
- **A serif headline voice + sans content** (see Foundations) does the hierarchy work — quiet, confident, premium; never competing styles or loud color.
- **Composed data-viz.** Thin axes, restrained gridlines, calm — intentional, not flashy.

## Foundations
- **Type — a serif/sans pairing (`font-serif` + `font-sans`).** A **serif display face (Fraunces, variable)** carries titles and headlines; **Inter** carries everything else. Both are wired through `next/font` in the root layout and exposed as the `--font-serif` / `--font-sans` Tailwind tokens (use the `font-serif` / `font-sans` utilities — never import a font ad hoc).
  - **Serif (`font-serif`) ONLY for:** page titles, section/card titles, card headlines (the ticker/company name), dialog titles, the app wordmark, and editorial moments (LLM-rendered markdown h1–h3). It is the headline voice — used sparingly for hierarchy, not decoration.
  - **Sans (`font-sans`, the body default) for everything else** — body, controls, eyebrow/uppercase labels, badges, and **every number**. **Serif NEVER on numbers or data** (prices, P&L, metrics, counts): numbers stay Inter with `tabular-nums`, always. Uppercase tracking-wide labels are labels, not titles — keep them sans.
  - Inter weights **400 / 500 / 600 only**; serif renders at **600**. `text-balance` for headings, `text-pretty` for body. Both faces ship a system fallback (`ui-serif`/`ui-sans-serif`) so headings still read in the right voice if the web font fails.
- **Type scale (app, not marketing):** page title ~28px/600 **serif**, section/card title ~15px/600 **serif** (small but in the serif voice), KPI number ~28–32px/600 **sans `tabular-nums`**, body 14–15px/400 sans, label 12px/500 sans in `text-fg-muted`. Never the skill's 72/23px marketing sizes. **The serif headline ↔ sans content contrast is the hierarchy** — a clear, premium two-voice pairing, not competing styles. Consistent line-height (~1.5 body); generous heading margins so sections read as distinct.
- **Spacing — the density fix:** 4px grid, but **generous**. Card padding 20–24px, section gaps 20–24px, real whitespace between groups. Err toward roomy. No arbitrary spacing values.
- **Radius (Plaid-generous):** cards 18–20px (`rounded-card` = 18px), pills/badges 26px+ (`rounded-pill` = 26px), inputs ~14px (`rounded-input` = 14px). No tight corners, no arbitrary radii.
- **Focus:** 2px accent outline with 2px offset. Never remove focus indicators.
- **Motion:** ≤200ms, `transform`/`opacity` only, `ease-out`, respect `prefers-reduced-motion`. Subtle hover **micro-interactions** are allowed — the `interactive` Card prop adds a hover lift + border tint (transform/border only, ~150ms); keep it restrained, never busy.
- Use `h-dvh` (never `h-screen`); use `size-*` for square elements.

## Color tokens
**Reduced palette: blue accent + neutrals + gain/loss only.** No lime survives anywhere (the previous system's `#B7DF2F` is fully removed). A small categorical palette is allowed **only** for true composition charts (sector/portfolio mix) — never to color everything.

### Dark mode (primary / reference)
| Token | Hex | Use |
|-------|-----|-----|
| surface-base | #1B1B1B | page background |
| surface-raised | #242426 | cards |
| surface-overlay | #2E2E32 | modals, popovers |
| border-default | #373D3E | dividers, card borders |
| text-primary | #EAEEF2 | headings / body |
| text-secondary | #9E9E9F | muted |
| text-tertiary | #9499A0 | hints (lightened from the spec's #6E7174 to clear ≥4.5:1) |
| accent | #7FB4D5 | actions, links, focus (black text on the fill) |
| accent-hover | #98C6E0 | hover |

### Light mode (secondary)
| Token | Hex |
|-------|-----|
| surface-base | #FFFFFF |
| surface-raised | #F7F7F8 |
| surface-overlay | #FFFFFF (+shadow) |
| border-default | #E6E6E8 |
| text-primary | #1B1B1B |
| text-secondary | #5F5E5A |
| text-tertiary | #6E6E6B |
| accent | #2A72A3 (Plaid blue deepened for white text on the fill) |
| accent-hover | #245F89 |

### Trading semantics
| Token | Dark | Light |
|-------|------|-------|
| gain | #22C55E | #0A7A33 |
| loss | #FF6B3D | #C93600 |

### Categorical palette (composition charts ONLY)
`chart-1 … chart-6` (`bg-chart-1`, `stroke-chart-1`, …) — a restrained six-hue set for **true composition charts only** (portfolio/sector mix donuts via `CompositionRing`). **Never** for status, KPIs, or general decoration; everything else stays blue accent + neutrals + gain/loss. Dark: blue / violet / amber / teal / rose / slate, lifted for the dark surface; light: the same hues deepened.

- The **light** blue/green/red are intentionally deeper than the dark theme's so they clear **≥4.5:1 as text** on white — the spec's raw light values (`#2F7DB0`/`#00A301`/`#E03A00`) fail that bar; contrast wins. Dark values are exactly as specced.
- Accent (blue) = primary actions (as a **fill**), links, and focus **only** — never a surface, and **never to convey status** (see below).
- **Link text uses the `link` token, NOT raw `accent`.** Use `text-link` / `hover:text-link-hover` for anchor text. `text-accent` stays valid for an accent **fill**, the focus ring, or a hover on dark surfaces.
- Maintain **≥4.5:1** text contrast in both themes (verified across every text/surface pair).

### Status & verdict colors
- **Never use the accent for status** — it's the brand/action color. Status uses **semantic** tones, with the darker stop for text on a light tint (≥4.5:1).
- **Evaluation verdict:** Go-candidate → success (green), Iterate → warning (amber), No-go → danger (red), Incomplete → neutral/muted. Render as readable text on a light tint of the same hue — never accent-on-accent.
- Reuse these semantic tones consistently for any pass / warn / fail state (`src/lib/red-team-style.ts`, `src/lib/eval/verdict-style.ts`).

### Confidence & model self-ratings
- Display model confidence as a **labeled scale** (Low / Moderate / High) plus the number, with a clear **segmented** meter — not a thin unlabeled bar.
- Keep the meter color **neutral/informational**, NOT gain/loss green-red: high confidence on a bad trade is still a bad trade.
- Always frame it as **model self-rated and uncalibrated** (e.g. a tooltip): one input alongside the risk rails and red-team, not a probability.

## Iconography
- **One icon library: `lucide-react`.** All icons are re-exported under semantic names from `src/components/icons.tsx` (e.g. `OverviewIcon`, `WalletIcon`) via a thin wrapper that sets a consistent stroke width (1.75), a default 20px square (override with `className` — `size-4` inline, `size-5` nav), `currentColor` (icons inherit token colors), and `aria-hidden` (icons are decorative; the text label carries meaning). Import icons from `@/components/icons`, never from `lucide-react` directly, so the set stays swappable and consistent. No mixed sets, no hand-drawn SVGs (the sidebar brand glyph is a logo, not an icon).
- `aria-label` on every icon-only control (e.g. the theme toggle).

## Charts & data-viz
- One consistent visual language for the equity curve, sparklines, R:R bar, earnings beat/miss strip, and KPI deltas: gain/loss semantic colors, the blue accent for neutral series, **thin axes, restrained gridlines**, `tabular-nums` labels. Data should look composed, not raw.
- The **symbol chart stays as-is** (owner likes it) — restyle only its surrounding surface to match.

## Glossary tooltips
- **One central glossary** (`src/lib/glossary.ts`): `term → { label, definition, caveat? }`. Definitions live here once and are reused everywhere — never hardcode an explanation inline. Caveats reuse the honest copy we already surface (uncalibrated confidence, IEX vs the consolidated tape, metered Perplexity, dry-run sink, advisory vs approvable).
- **One reusable component** (`<Term term="…">`, `src/components/term.tsx`): a subtle dotted-underline trigger + small info dot; opens on hover, focus, AND tap; dismisses on Esc / blur / outside tap. The trigger is a real button (`aria-expanded`), the popover is `role="tooltip"` linked via `aria-describedby`; no motion, so reduced-motion is respected by construction.
- **Restraint:** tag a term only on its **primary** appearance per view, and only genuinely jargony terms/acronyms — never decorate every word.

## Components
- **Buttons:** primary = accent fill (white text in light, black text in dark), hover toward `accent-hover`; secondary = subtle 1px border; ghost = transparent. Disabled = `opacity: 0.5`, `cursor: not-allowed`.
- **Enriched KPI card:** small tinted rounded-square icon + muted label + big number (two-tone — de-emphasize secondary digits in `text-fg-subtle`) + compact delta pill (gain/loss tinted) + optional sparkline.
- **Progress bars for every target** (guardrail headroom, evaluation window X/30, live caps): neutral track + accent/semantic fill + value label.
- **Grouped, icon-led lists:** entity icon + two-line label + right-aligned number + status pill, sectioned by date.
- **Hero card (`HeroCard`):** the one focal surface per page — a gradient + soft glow + faint masked dot-grid (`surface-hero` / `bg-dot-grid`) carrying the big number (`HeroMetric`) and flatter supporting stats (`HeroStat`). Used once per page; everything else is a flatter card so the rhythm reads hero → supporting.
- **Risk-posture gauge (`RiskPostureGauge` / `RiskPostureCard`):** a single gradient arc (teal → amber → red via the `--gauge-*` ramp — a non-semantic *exposure* ramp, NOT gain/loss) that fills to the score via `stroke-dasharray` on a `pathLength={100}` path, a glowing indicator dot on the arc, and the score + level in the center well (Inter `tabular-nums`). Driven entirely by the 0–100 score so one component renders the full + `compact` variants. The score is a **pure, unit-tested** function (`src/lib/risk-posture.ts`, inputs → score + factors + summary) over REAL signals — never a vibe; the card shows the factor breakdown + a plain-language summary and frames it honestly as **a snapshot of current positioning, not a prediction or safety rating** (glossary `risk-posture`). a11y: `role="img"` with a full text equivalent.
- **Proposals — slim date-grouped table** (`ProposalsList`, shared by the Proposals page + Overview "Awaiting review"): proposals bucket into **Eastern-day groups** (`groupProposalsByDay`, pure + tested) under serif headers ("Today · Jun 26" / "Yesterday" / dated) with a count. Each row is a **real `<button>`** (keyboard-focusable, full-row hover) — a primary line (side pill · **serif** ticker · advisory/live tag · status badge · chevron) over a muted meta line (sector · R:R · red-team verdict pill · confidence, all `tabular-nums`). The row is slim and scannable; **clicking it opens the full-context modal** — never a card wall.
- **Formatted detail modal (`Modal` + `ProposalDetailModal`):** the proposal row opens a sectioned modal (NOT a text dump) — thesis, a derived **pre-trade checklist** (pass/flag chips; thresholds from `RISK_LIMITS` + documented signal floors, never hardcoded), **sizing math** (with the **R:R bar** as its hero visual), **research** highlights + link-out, and the **full red-team reasoning**. The decisions (approve / reject / review) live in the modal's **pinned `footer`** so the table stays slim; "Approve…" hands off to the `AlertDialog` confirm + precheck. `Modal` is the reusable content-dialog primitive (native `<dialog>`: focus-trap, Esc, backdrop-dismiss, returns focus to the trigger, `aria-modal`, optional pinned `footer`, no motion) — distinct from `AlertDialog` (confirm actions).
- **Red-team verdict callout (`RedTeamVerdict`):** a verdict-**tinted** block with a colored **left rail** (success/warning/danger via `redTeamVerdictStyle.callout`), a semantic verdict badge, the basis line, and stance-coloured factors — visually distinct from the thesis, never the brand accent.
- **Empty states** carry a small calm icon moment (a tinted rounded-square + `InfoIcon`), not bare text — see `ModuleEmpty` / `Placeholder`. Honest, never fake/sample data dressed up as real.
- Show errors next to the action that caused them. Use the shared **`Skeleton`** primitive (`ui/skeleton.tsx`) for loading where the layout is known, not spinners.
