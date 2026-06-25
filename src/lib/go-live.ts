/**
 * Go-live readiness — a read-only checklist of the steps between the shipped
 * (gate-closed) state and human-approved live execution. It only ever *reports*
 * status and points at what to do; it never exposes a control that opens a gate
 * (per `.agents/nextjs.md` — the dashboard may close/kill, never arm).
 *
 * Pure builder here (client-safe); the server gathers the inputs in
 * `src/lib/server/go-live.ts`.
 */
export type ReadinessState = "done" | "todo" | "info";

export interface ReadinessItem {
  id: string;
  label: string;
  state: ReadinessState;
  /** What's true now, or what the human does next. */
  detail: string;
}

export interface ReadinessInput {
  connected: boolean;
  brokerGateOpen: boolean;
  harnessGateOpen: boolean;
  disconnected: boolean;
  liveEnabled: boolean;
  /** True when stale `mcp__robinhood__*` ids are still in the settings files. */
  staleToolIds: boolean;
  /** True when the live account has capital to trade (snapshot or env). */
  funded: boolean;
}

/** The ordered checklist, in the order a human acts on it. */
export function buildReadiness(i: ReadinessInput): ReadinessItem[] {
  return [
    {
      id: "tool-ids",
      label: "Order-tool ids corrected",
      state: i.staleToolIds ? "todo" : "done",
      detail: i.staleToolIds
        ? "Replace the stale mcp__robinhood__* ids with mcp__robinhood-trading__* in .claude/settings.json."
        : "No stale mcp__robinhood__* ids found in the settings files.",
    },
    {
      id: "connected",
      label: "Robinhood Agentic account connected",
      state: i.connected ? "done" : "todo",
      detail: i.connected
        ? "ROBINHOOD_AGENTIC_ACCOUNT_NUMBER is set (read-only)."
        : "Set ROBINHOOD_AGENTIC_ACCOUNT_NUMBER in .env.",
    },
    {
      id: "broker-gate",
      label: "Broker gate open",
      state: i.brokerGateOpen ? "done" : "todo",
      detail: i.brokerGateOpen
        ? "Agent trading is attested (ROBINHOOD_BROKER_TRADING_ENABLED=1)."
        : "Enable agent trading on the Robinhood account, then set ROBINHOOD_BROKER_TRADING_ENABLED=1.",
    },
    {
      id: "harness-gate",
      label: "Harness gate open",
      state: i.harnessGateOpen ? "done" : "todo",
      detail: i.harnessGateOpen
        ? "Both order tools are allow-listed (and not denied) in .claude/settings.json."
        : "Allow-list mcp__robinhood-trading__place_equity_order + cancel_equity_order (and remove them from deny).",
    },
    {
      id: "not-halted",
      label: "No disconnect halt latched",
      state: i.disconnected ? "todo" : "done",
      detail: i.disconnected
        ? "A disconnect / kill-switch halt is latched — clear it to re-arm."
        : "No halt latched.",
    },
    {
      id: "funded",
      label: "Account funded",
      state: i.funded ? "done" : "info",
      detail: i.funded
        ? "The live account has capital to trade."
        : "Fund the account to place buys (≤ $100/week cap). Optional until you want to trade.",
    },
  ];
}
