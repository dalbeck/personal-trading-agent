# Position-mid charter — the mid-term / position sleeve

> **Inherited safety envelope (shared, non-negotiable).** This sleeve inherits the
> cross-sleeve safety envelope enforced in `../charter.config.ts` and
> `src/lib/server/live-guards.ts` — see [the sleeve README](README.md#inherited-safety-envelope-shared-non-negotiable).
> The Phase-3 live envelope (`LIVE_LIMITS`), the single **6-order/day** counter,
> the **two-gate + per-trade human approval** model, and the prohibited universe
> (options / crypto / futures / margin) all bind this sleeve unchanged. The agent
> can never raise a rail, open a gate, or edit this charter. **Not investment
> advice.**

`position-mid` is the desk's **mid-term / position** sleeve (weeks–quarters) — the
middle horizon between the days-to-weeks swing desk and the multi-year core book.
It runs the **same governed pipeline** as every other sleeve; only the entry
criteria, rails, lens, and cadence differ. **Opt-in, off by default**
(`positionMidSleeveEnabled`).

## Mandate

A weeks-to-quarters position trade that **blends trend with fundamentals**. Trend
still matters, but a **named fundamental thesis is allowed to lead**, and an
**earnings event inside the (longer) holding window is tolerated** rather than
auto-disqualifying as it is for a swing trade. Profit targets and review dates are
longer-dated.

## Universe

US single names (the swing universe). No funds. (ETFs/index funds are the
`core-long` sleeve's permission, not this one.)

## Sizing & risk

- Sized **risk-to-stop** like swing, but with the **position-mid rail block**
  (`POSITION_MID_LIMITS` in `../charter.config.ts`): a **wider stop band** (12% vs
  the swing 8%, the tighter of that and 2×ATR still winning) and a **slightly
  larger per-name size cap** (25% vs swing 20%) for a higher-conviction, longer
  hold. **A stop is still required** (`requiresStop: true`) — a stopless mid entry
  is rejected and journaled, exactly as for swing. All inside the shared live
  envelope; rail numbers are tripwire-tested.

## Red-team lens

Prosecuted under the **position-mid** lens (never merged with trend / value /
core). It expects a **multi-week thesis** and does **not** punish the absence of an
immediate momentum trigger, and it **tolerates an earnings event inside the holding
window** (weighed as risk, not an auto-reject). It still prosecutes: a **broken
multi-week trend**, a **deteriorating fundamental story**, an **imminent binary**
that exceeds the position's risk, or a **loose target / thin reward-risk**.

## Checklist

Still requires a (wider-band) **stop** and a **reward:risk**, but a **fundamental
target is appropriate** (not weak) and a named fundamental thesis can carry the
why. It **drops the breakout-volume item** — a mid entry isn't a momentum chase.

## Benchmark & cadence

Benchmarked against **SPY**. Reviewed on a **weekly** cadence (between the swing
desk's daily hunt and the core book's quarterly review).

## Change-log (position-mid sleeve)

> **2026-06-28 — Mid-term / position sleeve authorized (position-mid M4).** Enabled
> the `position-mid` sleeve (weeks–quarters): a **named fundamental thesis may
> lead** and an **earnings event inside the holding window is tolerated** (not the
> auto-disqualifier it is for swing); it uses the M2 `position-mid` rail block — a
> **wider stop band** (12%) and a slightly larger per-name size cap (25%) — all
> still **`requiresStop: true`**, all inside the global live envelope and
> tripwire-tested. It carries its **own red-team lens** (expects a multi-week
> thesis, tolerates earnings-in-window, but still prosecutes a broken trend, a
> deteriorating fundamental story, an imminent binary that exceeds the risk, or a
> loose target — never merged with the other lenses) and its **own checklist**
> (wider-band stop, multi-week / fundamental target, no breakout-volume item). A
> manual analyze-a-symbol can produce a position-mid proposal (`sleeve:
> "position-mid"` on `POST /api/proposals/analyze`); discovery surfacing is gated by
> `positionMidSleeveEnabled` (off by default). Execution stays the same two-gate,
> per-trade-approved path. Swing and core sleeves unchanged; the 6-order/day cap and
> live envelope still bind. See `planning/portfolio-sleeves-and-horizons-spec.md`.
