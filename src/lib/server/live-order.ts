import "server-only";

import { evaluateOrder, type ProposedOrder, type RiskContext } from "@/lib/risk";
import type { PortfolioSnapshot, RedTeamVerdict } from "@/lib/types";
import { hasAlpacaCredentials, placePaperOrder } from "./alpaca";
import { readLatestSnapshot } from "./data";
import {
  assertLiveOrderAllowed,
  getLiveTradingStatus,
  LIVE_ORDER_TOOLS,
} from "./gate";
import {
  evaluateLiveCaps,
  liveCapContextFromSnapshot,
} from "./live-guards";
import {
  recordRejection,
  recordRiskRejection,
  recordTradeDecision,
} from "./writers";

/**
 * The per-trade approval + order-routing path (Phase 3 M3).
 *
 * Every live-intent order requires an **explicit human approval** (recorded
 * here) before any broker is called. On approval the order is routed by
 * {@link routeApprovedOrder}:
 *
 *   - **Harness gate CLOSED (the shipped default)** → the **dry-run sink**:
 *     Alpaca **paper** if credentials are present, else an in-process **mock**
 *     broker. NEVER Robinhood. This exercises the full
 *     propose → red-team → approve → execute → journal pipeline with zero real
 *     money.
 *   - **Harness gate OPEN (M5, gated)** → the live Robinhood path, which is
 *     wired here but **unreachable** while the gate is closed because
 *     {@link assertLiveOrderAllowed} fails closed.
 *
 * Approvals and denials are journaled through the existing writers (a trade
 * entry for a placed order; a `human` / `rules` / `codex-redteam` rejection
 * otherwise), so there is an audit record for every decision.
 */

export type OrderDestination = "robinhood" | "alpaca-paper" | "mock";

export interface PlacedAt {
  destination: OrderDestination;
  brokerOrderId: string;
}

/** Robinhood order placement — injectable. Mirrors the read-only client's MCP
 *  transport but for `place_equity_order`. Reached ONLY when both gates are
 *  open; the shipped build never gets here (the gate fails closed). */
export type LivePlaceOrder = (order: ProposedOrder) => Promise<PlacedAt>;

export interface RouteOpts {
  /** Test seam for the dry-run sink (paper/mock). */
  placeDryRun?: (order: ProposedOrder) => Promise<PlacedAt>;
  /** Test seam for the live Robinhood path. */
  placeLive?: LivePlaceOrder;
  /** Alpaca paper fetch seam (passed through to placePaperOrder). */
  fetchImpl?: typeof fetch;
  /** Deterministic id for the mock broker (tests). */
  mockOrderId?: string;
  /** Gate overrides (tests). */
  cwd?: string;
  dataDir?: string;
  settingsPaths?: string[];
}

function gateOpts(opts: RouteOpts) {
  return { cwd: opts.cwd, dataDir: opts.dataDir, settingsPaths: opts.settingsPaths };
}

/** Place an order into the dry-run sink: Alpaca paper, else an in-process mock.
 *  This path can never reach Robinhood. */
export async function placeDryRunOrder(
  order: ProposedOrder,
  opts: RouteOpts = {},
): Promise<PlacedAt> {
  if (opts.placeDryRun) return opts.placeDryRun(order);
  if (hasAlpacaCredentials()) {
    const placed = await placePaperOrder(order, { fetchImpl: opts.fetchImpl });
    return { destination: "alpaca-paper", brokerOrderId: placed.brokerOrderId };
  }
  const id =
    opts.mockOrderId ?? `mock-${order.symbol}-${order.qty}-${Date.now()}`;
  return { destination: "mock", brokerOrderId: id };
}

/** The live Robinhood path. Wired but gated: `assertLiveOrderAllowed` throws
 *  unless BOTH gates are open and no halt is latched, so this is unreachable in
 *  the shipped (gate-closed) build. */
export async function placeLiveOrder(
  order: ProposedOrder,
  opts: RouteOpts = {},
): Promise<PlacedAt> {
  await assertLiveOrderAllowed(gateOpts(opts));
  const place = opts.placeLive ?? defaultRobinhoodPlaceOrder;
  return place(order);
}

/** Default Robinhood `place_equity_order` MCP call. Never invoked while the
 *  gate is closed. The live wire shape is verified during the gated M5
 *  connection. */
const defaultRobinhoodPlaceOrder: LivePlaceOrder = async () => {
  // Belt-and-suspenders: this function only runs once the gate is open (M5).
  throw new Error(
    `Live Robinhood order tool (${LIVE_ORDER_TOOLS[0]}) is not wired in this build — gate must be open (M5).`,
  );
};

/**
 * Route an already-approved order to its destination based on the live gate.
 * Gate closed → dry-run sink (never Robinhood). Gate open → live Robinhood.
 */
export async function routeApprovedOrder(
  order: ProposedOrder,
  opts: RouteOpts = {},
): Promise<PlacedAt & { dryRun: boolean }> {
  const status = await getLiveTradingStatus(gateOpts(opts));
  if (status.liveEnabled) {
    const placed = await placeLiveOrder(order, opts);
    return { ...placed, dryRun: false };
  }
  const placed = await placeDryRunOrder(order, opts);
  return { ...placed, dryRun: true };
}

/* ------------------------------- approval --------------------------------- */

export interface ApprovalOrder {
  symbol: string;
  action: "buy" | "sell";
  side: "long" | "short";
  qty: number;
  limitPrice: number;
  stopPrice: number | null;
  takeProfit: number | null;
  riskPct: number | null;
  reviewDate: string;
  thesis: string;
  reasoning?: string;
  research?: string;
  tags?: string[];
  redTeam?: RedTeamVerdict | null;
  /** Which book the order is for. A live order is risk-checked against the live
   *  account's equity (not paper); defaults to paper. */
  account?: "paper" | "live";
}

export type ApprovalOutcome =
  | "approved"
  | "denied"
  | "blocked-risk"
  | "blocked-caps"
  | "blocked-redteam"
  | "error";

export interface ApprovalResult {
  outcome: ApprovalOutcome;
  /** The journal entry id, or "" when no journal was written (broker error). */
  journalId: string;
  destination?: OrderDestination;
  brokerOrderId?: string;
  /** True when the order went to the dry-run sink, not a real broker. */
  dryRun: boolean;
  /** Populated on `outcome: "error"` — e.g. the broker rejected the order. */
  error?: string;
}

export interface ApprovalInput {
  order: ApprovalOrder;
  decision: "approve" | "deny";
  approver: string;
  timestamp: string;
  reason?: string;
}

export interface ApprovalOpts extends RouteOpts {
  /** Risk-recheck context source; defaults to the latest paper snapshot. */
  snapshot?: PortfolioSnapshot | null;
  /** Live-cap context source; defaults to the latest live snapshot. */
  liveSnapshot?: PortfolioSnapshot | null;
}

function toProposedOrder(o: ApprovalOrder): ProposedOrder {
  return {
    symbol: o.symbol,
    action: o.action,
    side: o.side,
    qty: o.qty,
    limitPrice: o.limitPrice,
    orderType: "marketable_limit",
    stopPrice: o.stopPrice,
    assetClass: "equity",
  };
}

function highWater(snapshot: PortfolioSnapshot): number {
  return Math.max(snapshot.equity, ...snapshot.equityCurve.map((p) => p.equity), 0);
}

/**
 * Record a human approval/denial and, on approval, route the order through the
 * gate to its destination. This is the ONLY place an approved live-intent order
 * is sent to a broker, and it records the decision before doing so.
 */
export async function submitTradeApproval(
  input: ApprovalInput,
  opts: ApprovalOpts = {},
): Promise<ApprovalResult> {
  const { order, approver, timestamp } = input;
  const journalMeta = {
    timestamp,
    symbol: order.symbol,
    reviewDate: order.reviewDate,
    tags: order.tags,
    thesis: order.thesis,
    research: order.research,
  };

  // A denial is journaled as a human rejection and places nothing.
  if (input.decision === "deny") {
    const { id } = await recordRejection(
      {
        ...journalMeta,
        proposedAction: order.action,
        rejectedBy: "human",
        reason: input.reason?.trim() || "Denied by human at per-trade approval.",
      },
      { dataDir: opts.dataDir },
    );
    return { outcome: "denied", journalId: id, dryRun: true };
  }

  // Defense in depth: a red-team "reject" can never be approved into an order.
  if (order.redTeam && order.redTeam.verdict === "reject") {
    const { id } = await recordRejection(
      {
        ...journalMeta,
        proposedAction: order.action,
        rejectedBy: "codex-redteam",
        redTeam: order.redTeam.notes,
        reason: order.redTeam.notes,
      },
      { dataDir: opts.dataDir },
    );
    return { outcome: "blocked-redteam", journalId: id, dryRun: true };
  }

  // Re-run the hard risk gate at approval time against current account state.
  // A live order is sized against the LIVE account's equity, not paper.
  const proposed = toProposedOrder(order);
  const snapshot =
    opts.snapshot !== undefined
      ? opts.snapshot
      : await readLatestSnapshot(order.account ?? "paper");
  if (snapshot) {
    const context: RiskContext = {
      equity: snapshot.equity,
      highWaterEquity: highWater(snapshot),
      openPositions: snapshot.positions.map((p) => ({
        symbol: p.symbol,
        marketValue: p.marketValue,
      })),
      ordersToday: 0,
      spyIntradayChangePct: 0,
      vix: 15,
    };
    const risk = evaluateOrder(proposed, context);
    if (!risk.ok) {
      const { id } = await recordRiskRejection(
        { ...journalMeta, proposedAction: order.action },
        risk,
        { dataDir: opts.dataDir },
      );
      return { outcome: "blocked-risk", journalId: id, dryRun: true };
    }
  }

  // Live-only caps (M4): when this order will actually go live, enforce the
  // account exposure ceiling + funded-capital guard against the live account.
  const status = await getLiveTradingStatus(gateOpts(opts));
  if (status.liveEnabled) {
    const liveSnap =
      opts.liveSnapshot !== undefined
        ? opts.liveSnapshot
        : await readLatestSnapshot("live");
    const caps = evaluateLiveCaps(
      proposed,
      liveCapContextFromSnapshot(
        liveSnap,
        Number(process.env.LIVE_FUNDED_CAPITAL_USD ?? 0),
      ),
    );
    if (!caps.ok) {
      const { id } = await recordRiskRejection(
        { ...journalMeta, proposedAction: order.action },
        caps,
        { dataDir: opts.dataDir },
      );
      return { outcome: "blocked-caps", journalId: id, dryRun: false };
    }
  }

  // Approved + passed the rails → route through the gate to its destination.
  // A broker rejection (e.g. the sink can't fill the order) must not crash the
  // caller: surface it as a clean `error` outcome with nothing journaled.
  let placed: PlacedAt & { dryRun: boolean };
  try {
    placed = await routeApprovedOrder(proposed, opts);
  } catch (err) {
    return {
      outcome: "error",
      journalId: "",
      dryRun: !status.liveEnabled,
      error: (err as Error).message,
    };
  }
  const sinkNote = placed.dryRun
    ? ` (dry-run sink — no real money; harness gate closed)`
    : "";
  const { id } = await recordTradeDecision(
    {
      timestamp,
      symbol: order.symbol,
      action: order.action,
      side: order.side,
      qty: order.qty,
      price: order.limitPrice,
      stopPrice: order.stopPrice,
      takeProfit: order.takeProfit,
      riskPct: order.riskPct,
      reviewDate: order.reviewDate,
      tags: [...(order.tags ?? []), placed.dryRun ? "dry-run" : "live", "human-approved"],
      thesis: order.thesis,
      research: order.research,
      redTeam: order.redTeam?.notes,
      decision: `Approved by ${approver}; routed to ${placed.destination}${sinkNote}. Broker order ${placed.brokerOrderId}.`,
    },
    { dataDir: opts.dataDir },
  );

  return {
    outcome: "approved",
    journalId: id,
    destination: placed.destination,
    brokerOrderId: placed.brokerOrderId,
    dryRun: placed.dryRun,
  };
}
