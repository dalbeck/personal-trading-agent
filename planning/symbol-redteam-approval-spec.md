# Build Spec — symbol page polish, red-team redesign, human override

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/design-system.md`, `.agents/nextjs.md`, `.agents/infra.md` (two-gate design) first. Three feature branches + PRs._

## M1 — `feature/symbol-perplexity-layout`
Mirror the Perplexity quote-page layout on `/symbol/[ticker]`:
- **Price header:** show open and prev/at-close values to the right of the price (not just the % change).
- **Right-rail company profile:** Symbol, IPO date, CEO, employees, sector, industry, country, exchange, description.
- **Stats grid:** Prev Close, Market Cap, Open, P/E, Day Range, Dividend Yield, 52-wk Range, EPS, Volume.
- **Analyst Consensus** block.
- **Sourcing:** price / OHLC / day range / 52-wk / volume = **Alpaca**; market cap, P/E, EPS, dividend, profile, analyst consensus = **Perplexity `finance_search`** (capped, default-off). Auto-load highlights within the cap on the symbol page; fall back to "—" + the link-outs when the provider is off or the cap is hit. Label which is which honestly.
- **Acceptance:** layout matches the referenced Perplexity formatting; Alpaca vs Perplexity fields sourced correctly; graceful when the provider is off; light + dark + a11y.

## M2 — `feature/redteam-verdict-redesign`
- Have the red-team routine emit **structured rationale** (verdict + keyed factors like entry/target/stop/edge + a short "basis"/conviction line), not one text blob. Update the proposal schema + `.agents/data-format.md` accordingly.
- Redesign the red-team component in the **proposal card and the approve dialog**: a **semantic verdict badge** (approve → success, concern → warning, reject → danger; per the design-system verdict rule), the structured factors, and a "how it decided / basis" line. Give it room — no cramped text.
- **Acceptance:** verdict reads clearly with semantic color; structured factors render; uncramped in both card and dialog; light + dark.

## M3 — `feature/go-live-and-overrides`
This enables real execution and makes every safeguard human-overridable. It is the user's deliberate choice on their own funded account. **No paper-evaluation prerequisite** — the scorecard is advisory only and must never block going live or any trade.

- **Go live (real execution):** fully support the two-gate go-live. With the broker gate (`ROBINHOOD_BROKER_TRADING_ENABLED`) and harness gate (`.claude/settings.json` order allow-list) open, **Approve places a real Robinhood order** with the per-trade confirmation. Make the Go-live checklist crisp and the live state unmistakable in the UI (a clear "LIVE TRADING: ON" banner).
- **Per-trade approval stays for real orders** — that's the user's "if I choose to" moment. (Fully unattended auto-execution is a separate future step, out of scope here.)
- **Human override of the red-team REJECT:** replace the hard block with a **2-step override** — (1) show the order + red-team reasoning prominently; (2) require a typed **justification comment** + explicit "Override & approve" (disabled until a comment is entered). Logged + tagged.
- **Configurable + overridable risk rails:** add a **Risk settings** page where the user can adjust or disable each rail (per-position cap, daily order cap, drawdown halt, stop-required, universe). A rail violation at approval time can also be **per-trade overridden** via the same 2-step + mandatory comment. Defaults stay safe; disabling/overriding a rail is explicit, acknowledged, and logged.
- **Everything logged:** going live, each real order, and every override (red-team or rail) with its comment → journal, for the user's own audit + model training.
- **Fix the cramped approve-dialog layout.**
- **Update `.agents/infra.md`** to record the new policy (rails configurable/overridable; scorecard advisory, not blocking).
- **Acceptance:** with gates open, Approve places a real order with the per-trade confirm; red-team rejects and rail violations are both human-overridable via 2-step + mandatory comment (unit-tested: override requires a non-empty comment); rails are configurable in settings; going live is never blocked by the scorecard; the LIVE banner is unmistakable; dialog readable; light + dark.

## The one line kept (and why it serves you, not limits you)
- **The agent never self-opens the live gate, never funds the account, and never places a real order without the user's explicit per-trade approval.** Opening the gate stays a deliberate human action (env + `settings.json`), not something a dashboard button or the agent can flip. This exists to stop the *software* — a bug, a stray click, or prompt-injection — from ever turning real-money trading on by itself. It does not limit the user, who can open the gate and trade whenever they choose.
- Not investment advice; the user owns every trade.

## Out of scope
- Fully unattended auto-execution (no per-trade approval). Options/crypto/margin.
