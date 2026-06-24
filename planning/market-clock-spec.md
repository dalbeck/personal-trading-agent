# Build Spec — market status clock in the header

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/nextjs.md`, `.agents/design-system.md` first. One feature branch + PR. No real-money paths._

## Goal
A compact **market-status pill** in the top header, next to the light/dark toggle, that dynamically shows whether the US equity market is open and the **time to the next boundary** — "Open · closes 4:00 PM · 2h 14m" when open, "Closed · opens 9:30 AM · 15h 42m" when closed — **holiday- and half-day-aware**. No wall clock / current time; just the next open or close.

## Data source — Alpaca (already wired)
- Use **Alpaca `/v2/calendar`** (sessions with real `open`/`close` per date — reflects half-day early closes) as the source of truth, optionally cross-checked with **`/v2/clock`** (`is_open`, `next_open`, `next_close`). Both are **holiday- and half-day-aware**, so no hardcoded holiday list.
- Server-side only (keys never reach the client). Base URL = `ALPACA_BASE_URL` (the trading API).
- **Cache** the calendar (fetch a window, e.g. today ±7 days, cache for hours) so the header doesn't hammer Alpaca; compute status + next boundary from the cached calendar.

## Behavior
- A server route (e.g. `GET /api/market/status`) returns `{ isOpen, nextOpen, nextClose, sessionClose, isHalfDay, holidayName? }` (ISO timestamps).
- The client header component computes the **countdown locally** from those boundary timestamps and ticks (every ~30s is enough; minute-level display). Re-fetch when the active boundary passes, or every few minutes.
- **Timezone correctness:** all market logic and displayed times are in **America/New_York** via `Intl`/timezone — independent of the user's machine clock (do not assume the Mac is ET). Display like "4:00 PM" with an ET implication.
- **Half-days:** trust Alpaca's session `close` (e.g. 1:00 PM early closes) — never hardcode 4:00 PM.
- **States:**
  - Open → green dot, "Open · closes {close} · {Xh Ym}".
  - Closed, opens later today/next weekday → gray dot, "Closed · opens {open} · {Xh Ym}" (or "opens Mon 9:30 AM" when far off).
  - Holiday/weekend → "Closed · opens {weekday} 9:30 AM"; optionally show a holiday label.
- **Holiday name (optional, cosmetic):** Alpaca's calendar marks the closure but does not return a name. A tiny bundled date→name map may supply "Juneteenth" etc.; fall back to "market holiday" if unknown. The *closed/next-open logic itself is authoritative from Alpaca* — the name is decoration only.

## Graceful degradation (no Alpaca creds)
- If Alpaca credentials are absent/failing, fall back to **regular hours only** (Mon–Fri 9:30 AM–4:00 PM ET, **no** holiday awareness) and clearly label it best-effort (e.g. a subtle "approx." marker or tooltip). Honest, consistent with the sample-data principle — never imply holiday-accurate data we don't have.

## Accessibility & design
- Pill carries an `aria-label` like "Market open, closes in 2 hours 14 minutes" (update the label, not a chatty `aria-live` region). Design-system colors (success dot for open, muted for closed); fits the header at all widths; light + dark.

## Acceptance
- Pill shows correct open/closed status and an accurate ET countdown **regardless of the machine's timezone**; reflects half-day early closes and holidays from Alpaca; degrades to labeled regular-hours-only without creds; a11y label present; light + dark verified.
- **Unit test** the pure status/countdown function (given a fixed "now" + a calendar, it returns the right state and next boundary) — cover open, after-hours, weekend, holiday, and half-day cases.

## Out of scope
- Pre-market/after-hours sessions (regular session only). Real-money paths.
