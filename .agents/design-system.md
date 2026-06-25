# Design System

Derived from the Robinhood UI design skill (`ihlamury/design-skills`), with its mis-scraped color tokens corrected, marketing-scale typography reduced to app scale, a **light theme added** (the source skill is dark-only), and **trading gain/loss colors added**. Implement as CSS variables toggled by Tailwind's `dark` class.

## Foundations
- **Font:** Inter, everywhere. Use `tabular-nums` for ALL numeric/financial data. `text-balance` for headings, `text-pretty` for body.
- **Spacing:** 4px grid. No arbitrary spacing values.
- **Radius:** pills 21px; cards 12–19px. No arbitrary radii.
- **Focus:** 2px accent outline with 2px offset. Never remove focus indicators.
- **Motion:** ≤200ms, `transform`/`opacity` only, `ease-out` entrances, respect `prefers-reduced-motion`. No animation unless requested.
- Use `h-dvh` (never `h-screen`); use `size-*` for square elements.

## Color tokens

### Dark mode
| Token | Hex |
|-------|-----|
| surface-base | #000000 |
| surface-raised | #0E0E0E |
| surface-overlay | #1A1A1A |
| border-default | #2A2A2A |
| text-primary | #ECECEC |
| text-secondary | #A0A0A0 |
| accent | #B7DF2F |
| accent-hover | #C3FE09 |

### Light mode
| Token | Hex |
|-------|-----|
| surface-base | #FFFFFF |
| surface-raised | #F7F7F7 |
| surface-overlay | #FFFFFF (+ shadow) |
| border-default | #E5E5E5 |
| text-primary | #1A1A1A |
| text-secondary | #5C5C5C |
| accent | #B7DF2F (black text on fill) |

### Trading semantics
| Token | Dark | Light |
|-------|------|-------|
| gain | #00C805 | #00A301 |
| loss | #FF5000 | #E03A00 |

- Accent (lime) = primary actions (as a **fill** with black text) and focus **only** — never a surface, and **never to convey status** (see below). (The source skill mislabeled it as a card surface; do not repeat that.)
- **Link text uses the `link` token, NOT raw `accent`.** Lime text on a light surface is <2:1 and unreadable, so `--link` is a **darkened lime** in light mode (`#3F6212`, ≥4.5:1) and the lime accent in dark mode (high-contrast on black). Use `text-link` / `hover:text-link-hover` for anchor text — never `text-accent` for resting link text. (`text-accent` stays valid for an accent **fill**, focus ring, or a hover on dark surfaces.)
- Maintain ≥4.5:1 text contrast in both themes.

### Status & verdict colors
- **Never use the lime accent for status** — it's the brand/action color and reads as low-contrast mush on light tints. Status uses **semantic** tones, with the darker stop for text on a light tint (≥4.5:1).
- **Evaluation verdict:** Go-candidate → success (green), Iterate → warning (amber), No-go → danger (red), Incomplete → neutral/muted. Render as readable text on a light tint of the same hue — never accent-on-accent.
- Reuse these semantic tones consistently for any pass / warn / fail state.

### Confidence & model self-ratings
- Display model confidence as a **labeled scale** (Low / Moderate / High) plus the number, with a clear **segmented** meter — not a thin unlabeled bar that gets lost.
- Keep the meter color **neutral/informational**, NOT gain/loss green-red: high confidence on a bad trade is still a bad trade, so don't imply "good."
- Always frame it as **model self-rated and uncalibrated** (e.g. a tooltip): one input alongside the risk rails and red-team, not a probability.

## Components
- Buttons: primary = accent fill with black text, hover lightens toward `#C3FE09`; secondary = subtle 1px border; ghost = transparent. Disabled = `opacity: 0.5`, `cursor: not-allowed`.
- Show errors next to the action that caused them.
- Use structural skeletons for loading where the layout is known, not spinners.
