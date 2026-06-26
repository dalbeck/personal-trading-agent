# Design System

Plaid-style system (source skill `ihlamury/design-skills/skills/plaid`), with the skill's **mis-scraped tokens corrected**, marketing-scale typography reduced to app scale, a **light theme added** (the skill is dark-only), and **trading gain/loss colors added**. Implemented as CSS variables toggled by Tailwind's `dark` class (raw hexes live only in `src/app/globals.css`; components reference the mapped Tailwind tokens — `bg-surface`, `text-fg`, `text-gain`, `rounded-card`, … — never hardcoded values).

**Dark is the primary, reference theme.** Light mode is kept and inherits the same tokens, but dark is the showcase the design is judged against.

## Design tone — Mercury-grade restraint (governs everything)
The target is *premium, calm, "nonsense-free" clarity* — not a busy dashboard. Whitespace and typography do the heavy lifting; decoration is the exception.
- **When in doubt, remove.** A screen should feel like it has *less* on it than the data warrants.
- **One sophisticated accent** (the Plaid blue), used as precision — for the one thing that matters on a screen, not everywhere. Gain/loss semantics + neutrals otherwise.
- **Quiet, confident type.** Hierarchy through size/weight/color, never competing styles or loud color.
- **Understated data-viz.** Thin axes, restrained gridlines, calm. No flashy chrome.

## Foundations
- **Font:** Inter, everywhere. Weights **400 / 500 / 600 only**. Use `tabular-nums` for ALL numeric/financial data. `text-balance` for headings, `text-pretty` for body.
- **Type scale (app, not marketing):** page title ~24px/600, section heading ~18px/600, KPI number ~28–32px/600, body 14–15px/400, label 12px/500 in `text-fg-muted`. Never the skill's 72/23px marketing sizes. **Headlines ↔ content should read as one family** — differentiate by size + weight + color (primary vs muted), not by competing styles. Consistent line-height (~1.5 body); generous heading margins so sections read as distinct.
- **Spacing — the density fix:** 4px grid, but **generous**. Card padding 20–24px, section gaps 20–24px, real whitespace between groups. Err toward roomy. No arbitrary spacing values.
- **Radius (Plaid-generous):** cards 18–20px (`rounded-card` = 18px), pills/badges 26px+ (`rounded-pill` = 26px), inputs ~14px (`rounded-input` = 14px). No tight corners, no arbitrary radii.
- **Focus:** 2px accent outline with 2px offset. Never remove focus indicators.
- **Motion:** ≤200ms, `transform`/`opacity` only, `ease-out` entrances, respect `prefers-reduced-motion`. No animation unless requested.
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
- Show errors next to the action that caused them. Use structural skeletons for loading where the layout is known, not spinners.
