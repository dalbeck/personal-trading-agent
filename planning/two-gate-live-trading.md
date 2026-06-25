# Two-Gate Live Trading — permission model & procedure

_Phase 3 M2/M5. How real-money order capability is gated. **Both gates plus a
clear disconnect must all be satisfied before a single live order can be
placed.** The agent can open neither gate; opening them is a deliberate human
act. Per the 2026-06-25 charter update, **human-approved per-trade** execution
is gated on the human (you approve each order), not on the scorecard; **hands-off
automation** remains gated on a passing `phase-2-evaluation-scorecard.md`. This
is not investment advice._

> **⚠ Tool-id correction (M5b).** The committed `.claude/settings.json` denies
> the **wrong** order-tool ids (`mcp__robinhood__*`); the real MCP server is
> `robinhood-trading`, so the tools are **`mcp__robinhood-trading__place_equity_order`**
> and **`mcp__robinhood-trading__cancel_equity_order`** (now used everywhere in
> code + scripts). The agent cannot edit `.claude/**`, so **you must correct the
> deny-list to the `robinhood-trading` ids** — until then the deny is
> ineffective (defense-in-depth only; the gate still fails closed because the
> tools aren't allow-listed).

## The two gates (both required)

| Gate | What it is | Who controls it | How it reads "open" |
|------|-----------|-----------------|---------------------|
| **1. Broker gate** | The Robinhood **Agentic account** itself permits agent trading. Lives in Robinhood's system — *entirely outside this repo*. | Human, in the Robinhood account settings. | The app mirrors it via the `ROBINHOOD_BROKER_TRADING_ENABLED=1` attestation in `.env`. |
| **2. Harness gate** | The order tools (`place_equity_order` / `cancel_equity_order`) are permitted in the Claude Code allow-list. | Human, editing `.claude/settings.json`. | `getLiveTradingStatus()` reads the allow/deny lists; open only when both tools are **allowed and not denied**. |

`liveEnabled = brokerGateOpen && harnessGateOpen && !disconnected`. Enforced in
code by `assertLiveOrderAllowed()` (`src/lib/server/gate.ts`), which every
live-order path must clear and which **fails closed**.

## Default shipped state: OFF

- `ROBINHOOD_BROKER_TRADING_ENABLED` is unset → broker gate **closed**.
- `.claude/settings.json` **denies** both order tools → harness gate **closed**.
- No disconnect halt latched.
- The dashboard shows **LIVE TRADING: OFF** with both gates marked closed.

## The agent cannot self-enable (verified)

- `src/lib/server/gate.ts` exposes **no** enable/open/grant/arm function — only
  readers, the fail-closed assert, and `disconnectLive` (the *safe* halt-only
  direction).
- `.claude/settings.json` denies the agent's `Edit`/`Write` tools on
  `.claude/**`. Attempting to add an order tool to the allow-list from inside
  the agent is hard-blocked by the harness ("directory is denied by your
  permission settings").
- The broker gate is set in Robinhood's account, which the agent cannot reach
  at all.

## To OPEN the gates (human only — human-approved execution)

1. **Broker gate** — enable agent trading on the Robinhood Agentic account, then
   set `ROBINHOOD_BROKER_TRADING_ENABLED=1` in `.env`.
2. **Harness gate** — in `.claude/settings.json`, remove both order tools from
   `permissions.deny` and add them to `permissions.allow`, using the correct ids:
   - `mcp__robinhood-trading__place_equity_order`
   - `mcp__robinhood-trading__cancel_equity_order`
   (Two-part because the committed default denies them as defense-in-depth, and a
   deny always wins. Correct any stale `mcp__robinhood__*` entries while you're
   here — see the warning above.)
3. **Supervised wire-shape check** — place ONE small, human-approved test order
   and confirm the Robinhood MCP `place_equity_order` request/response shape
   matches `buildPlaceOrderCliCommand` / the `{ "orderId": ... }` parse in
   `live-order.ts`; adjust if the live shape differs.
4. Confirm the dashboard reads **LIVE TRADING: ON** and both gates show open.

Per-trade human approval (M3) stays ON regardless — the app **never**
auto-trades; every live order waits on your explicit approval. **Hands-off
automation** (no human in the loop) is separate and still requires a passing
`phase-2-evaluation-scorecard.md`. Funding the account is a separate deliberate
act. None of this is in scope for the agent.

## To CLOSE / halt immediately

- **Disconnect** (dashboard, one click, or `POST /api/live/disconnect`): latches
  live trading OFF instantly. Safe by construction — it can only reduce
  capability. Survives until a human clears it.
- Re-arming is deliberate: clear the halt **and** the gates must still be open.
- The M6 kill switch extends this to revoking the harness permission and
  disconnecting the MCP in one action.
