import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import {
  evaluateOrder,
  type ProposedOrder,
  type RiskContext,
  type RiskLimits,
  type Violation,
} from "@/lib/risk";
import type { PortfolioSnapshot, RedTeamVerdict } from "@/lib/types";
import { hasAlpacaCredentials, placePaperOrder } from "./alpaca";
import { readLatestSnapshot } from "./data";
import {
  assertLiveOrderAllowed,
  getLiveTradingStatus,
  ROBINHOOD_MCP_SERVER,
} from "./gate";
import {
  evaluateLiveCaps,
  liveCapContextFromSnapshot,
} from "./live-guards";
import {
  getMarketConditions,
  type MarketConditions,
} from "./market-conditions";
import { incrementOrdersToday, readOrdersToday } from "./order-counter";
import { getEffectiveRiskConfig } from "./risk-settings";
import {
  runRedTeam,
  type RedTeamExec,
  type RedTeamProposal,
} from "./red-team";
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

const runCli = promisify(execFile);

/** How long to wait for the `claude` CLI order placement before failing. */
const LIVE_ORDER_CLI_TIMEOUT_MS = 90_000;

/** Tools the order spawn must NEVER call — everything except the single
 *  `place_equity_order`. Enumeration + cancel + option order tools are all
 *  explicitly disallowed in the spawned argv (belt to the gate's suspenders). */
const PLACE_DISALLOWED_TOOLS = [
  "get_accounts",
  "cancel_equity_order",
  "place_option_order",
  "cancel_option_order",
].map((t) => `mcp__${ROBINHOOD_MCP_SERVER}__${t}`);

/** Pull the first balanced JSON object out of CLI stdout. */
function extractOrderJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Robinhood order placement returned no JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Build the `claude -p` argv that places ONE marketable-limit order for the
 * configured Agentic account through the host CLI's authenticated Robinhood MCP
 * session. Pure + exported so the safety invariants are unit-tested without
 * spawning: ONLY `place_equity_order` is allow-listed (account-scoped), every
 * enumeration / cancel / option tool is explicitly disallowed, and exactly one
 * order is requested. Reached ONLY when both gates are open.
 */
export function buildPlaceOrderCliCommand(
  account: string,
  order: ProposedOrder,
): { cmd: string; args: string[] } {
  const placeTool = `mcp__${ROBINHOOD_MCP_SERVER}__place_equity_order`;
  const prompt = [
    `Use the ${ROBINHOOD_MCP_SERVER} MCP. Operate ONLY on brokerage account ${account}.`,
    `Place EXACTLY ONE marketable-limit order and nothing else: do NOT call`,
    `get_accounts, do NOT cancel or modify any order, do NOT place any other order.`,
    `Call place_equity_order with account_number "${account}", symbol`,
    `"${order.symbol}", side "${order.action}", quantity ${order.qty}, order`,
    `type limit, limit price ${order.limitPrice}, time in force day.`,
    `Then output ONLY a single minified JSON object — no prose, no markdown`,
    `fences — copying the broker's order id verbatim: {"orderId":STRING}.`,
  ].join(" ");

  return {
    cmd: "claude",
    args: [
      "-p",
      prompt,
      "--allowedTools",
      placeTool,
      "--disallowedTools",
      ...PLACE_DISALLOWED_TOOLS,
    ],
  };
}

/**
 * Default Robinhood `place_equity_order` via the host `claude` CLI (argv, never
 * a shell), mirroring the read-only client's transport. **Self-gates**
 * (`assertLiveOrderAllowed`) so it is unreachable unless both gates are open,
 * on top of {@link placeLiveOrder}'s gate. The exact MCP request/response shape
 * is verified during the supervised, human-present gate-open step (M5); until
 * then this is never invoked. Injectable via `opts.placeLive` for tests.
 */
const defaultRobinhoodPlaceOrder: LivePlaceOrder = async (order) => {
  await assertLiveOrderAllowed();
  const account = process.env.ROBINHOOD_AGENTIC_ACCOUNT_NUMBER ?? "";
  if (!account) {
    throw new Error("ROBINHOOD_AGENTIC_ACCOUNT_NUMBER is not set");
  }
  const { cmd, args } = buildPlaceOrderCliCommand(account, order);
  const { stdout } = await runCli(cmd, args, {
    cwd: process.cwd(),
    timeout: LIVE_ORDER_CLI_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  const parsed = z
    .object({ orderId: z.string().min(1) })
    .parse(extractOrderJson(stdout));
  return { destination: "robinhood", brokerOrderId: parsed.orderId };
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

/**
 * A per-trade human override of an approval block (a red-team REJECT and/or a
 * risk-rail / live-cap violation). The owner can override any of these on their
 * own funded account, but ONLY with a **non-empty justification comment** — the
 * single safeguard the software enforces here (the two live gates are separate
 * and never overridable). A blank comment is NOT a valid override. Every applied
 * override is journaled with this comment. See `.agents/infra.md`.
 */
export interface ApprovalOverride {
  comment: string;
}

/** True only for a present override carrying a non-empty (trimmed) comment. */
export function hasValidOverride(override?: ApprovalOverride | null): boolean {
  return !!override && override.comment.trim().length > 0;
}

export interface ApprovalInput {
  order: ApprovalOrder;
  decision: "approve" | "deny";
  approver: string;
  timestamp: string;
  reason?: string;
  /** Present (with a non-empty comment) to override a red-team reject and/or a
   *  rail/cap violation at this approval. */
  override?: ApprovalOverride | null;
}

export interface ApprovalOpts extends RouteOpts {
  /** Risk-recheck context source; defaults to the latest paper snapshot. */
  snapshot?: PortfolioSnapshot | null;
  /** Live-cap context source; defaults to the latest live snapshot. */
  liveSnapshot?: PortfolioSnapshot | null;
  /** Red-team prosecutor seam (tests inject; default spawns `codex exec`). */
  redTeamExec?: RedTeamExec;
  /** Effective risk config seam (tests inject; defaults to the human's settings
   *  overlaid on the charter limits). */
  riskConfig?: { limits: RiskLimits; skipRules: readonly string[] };
  /** Orders-placed-today seam (tests inject; defaults to the persisted per-ET-day
   *  counter). Drives the daily-order-cap rail at approval. */
  ordersToday?: number;
  /** Live market conditions seam (tests inject; defaults to a live Alpaca read).
   *  Drives the SPY −2% / VIX>30 emergency-stop rail at approval. */
  market?: MarketConditions;
  /** ET-day / timestamp basis for the order counter (tests pin it; defaults to
   *  the approval timestamp, then the live clock). */
  now?: Date;
}

/**
 * The blocks an order faces at approval time, evaluated WITHOUT side effects:
 * the red-team verdict, the risk-rail violations (with the human's risk-settings
 * overlay applied), and the live-cap violations (only when the order will go
 * live). Used by the approve precheck (to drive the 2-step override UI) and by
 * {@link submitTradeApproval} itself.
 */
export interface ApprovalBlocks {
  redTeam: RedTeamVerdict | null;
  redTeamRejects: boolean;
  railViolations: Violation[];
  capViolations: Violation[];
  liveEnabled: boolean;
}

/** True when an order is blocked by red-team and/or a rail/cap violation. */
export function approvalIsBlocked(b: ApprovalBlocks): boolean {
  return (
    b.redTeamRejects ||
    b.railViolations.length > 0 ||
    b.capViolations.length > 0
  );
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

function toRedTeamProposal(o: ApprovalOrder): RedTeamProposal {
  return {
    symbol: o.symbol,
    action: o.action,
    side: o.side,
    qty: o.qty,
    limitPrice: o.limitPrice,
    stopPrice: o.stopPrice,
    takeProfit: o.takeProfit,
    thesis: o.thesis,
    reasoning: o.reasoning,
    research: o.research,
  };
}

function highWater(snapshot: PortfolioSnapshot): number {
  return Math.max(snapshot.equity, ...snapshot.equityCurve.map((p) => p.equity), 0);
}

/**
 * Evaluate every approval-time block WITHOUT side effects: the cross-model
 * red-team verdict, the risk-rail violations (with the human's risk-settings
 * overlay applied — a disabled rail is skipped, an adjusted number is honoured),
 * and the live-cap violations (only when the order will actually go live). The
 * red-team **fails closed** to a reject if it has no stored verdict and the
 * prosecutor is unavailable. Used by the approve precheck (to drive the 2-step
 * override UI) and by {@link submitTradeApproval}.
 */
export async function evaluateApprovalBlocks(
  order: ApprovalOrder,
  opts: ApprovalOpts = {},
): Promise<ApprovalBlocks> {
  const proposed = toProposedOrder(order);

  const redTeam =
    order.redTeam ??
    (await runRedTeam(toRedTeamProposal(order), { exec: opts.redTeamExec }));
  const redTeamRejects = redTeam.verdict === "reject";

  // Risk rails — sized against the relevant book, with the human's overlay.
  const snapshot =
    opts.snapshot !== undefined
      ? opts.snapshot
      : await readLatestSnapshot(order.account ?? "paper");
  let railViolations: Violation[] = [];
  if (snapshot) {
    const { limits, skipRules } =
      opts.riskConfig ??
      (await getEffectiveRiskConfig({ dataDir: opts.dataDir }));
    // Real risk-context inputs so the daily-order-cap and emergency-stop rails
    // actually fire at approval: the persisted per-ET-day order counter and a
    // live SPY/VIX read (both injectable for tests; both fail-soft).
    const ordersToday =
      opts.ordersToday ??
      (await readOrdersToday({ dataDir: opts.dataDir, now: opts.now }));
    const market = opts.market ?? (await getMarketConditions());
    const context: RiskContext = {
      equity: snapshot.equity,
      highWaterEquity: highWater(snapshot),
      openPositions: snapshot.positions.map((p) => ({
        symbol: p.symbol,
        marketValue: p.marketValue,
      })),
      ordersToday,
      spyIntradayChangePct: market.spyIntradayChangePct,
      vix: market.vix,
    };
    railViolations = evaluateOrder(proposed, context, limits, {
      skipRules,
    }).violations;
  }

  // Live-only caps (M4) — only when this order will actually go live.
  const status = await getLiveTradingStatus(gateOpts(opts));
  let capViolations: Violation[] = [];
  if (status.liveEnabled) {
    const liveSnap =
      opts.liveSnapshot !== undefined
        ? opts.liveSnapshot
        : await readLatestSnapshot("live");
    capViolations = evaluateLiveCaps(
      proposed,
      liveCapContextFromSnapshot(
        liveSnap,
        Number(process.env.LIVE_FUNDED_CAPITAL_USD ?? 0),
      ),
    ).violations;
  }

  return {
    redTeam,
    redTeamRejects,
    railViolations,
    capViolations,
    liveEnabled: status.liveEnabled,
  };
}

/**
 * Record a human approval/denial and, on approval, route the order through the
 * gate to its destination. This is the ONLY place an approved live-intent order
 * is sent to a broker, and it records the decision before doing so.
 *
 * A red-team **reject** and any risk-rail / live-cap **violation** block the
 * order UNLESS the human supplies a valid {@link ApprovalOverride} (a non-empty
 * comment) — their deliberate, logged choice on their own funded account. The
 * two live gates are never overridden here: an approved order still routes
 * through {@link routeApprovedOrder}, so the gate-closed default still lands in
 * the dry-run sink, never Robinhood.
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

  // One ET-day basis for both the cap read (in evaluateApprovalBlocks) and the
  // post-placement increment, so the daily-order counter stays consistent.
  const now = opts.now ?? new Date(timestamp);
  const blocks = await evaluateApprovalBlocks(order, { ...opts, now });
  const override = hasValidOverride(input.override);
  const proposed = toProposedOrder(order);

  // Each block holds UNLESS the human supplied a valid (non-empty-comment)
  // override. A blank comment is not a valid override, so the block still fires.
  if (blocks.redTeamRejects && !override) {
    const { id } = await recordRejection(
      {
        ...journalMeta,
        proposedAction: order.action,
        rejectedBy: "codex-redteam",
        redTeam: blocks.redTeam?.notes,
        reason: blocks.redTeam?.notes ?? "red-team reject",
      },
      { dataDir: opts.dataDir },
    );
    return { outcome: "blocked-redteam", journalId: id, dryRun: true };
  }

  if (blocks.railViolations.length > 0 && !override) {
    const { id } = await recordRiskRejection(
      { ...journalMeta, proposedAction: order.action },
      { ok: false, violations: blocks.railViolations },
      { dataDir: opts.dataDir },
    );
    return { outcome: "blocked-risk", journalId: id, dryRun: true };
  }

  if (blocks.capViolations.length > 0 && !override) {
    const { id } = await recordRiskRejection(
      { ...journalMeta, proposedAction: order.action },
      { ok: false, violations: blocks.capViolations },
      { dataDir: opts.dataDir },
    );
    return { outcome: "blocked-caps", journalId: id, dryRun: false };
  }

  // Approved (clean or via override) → route through the gate to its
  // destination. A broker rejection must not crash the caller: surface it as a
  // clean `error` with nothing journaled.
  let placed: PlacedAt & { dryRun: boolean };
  try {
    placed = await routeApprovedOrder(proposed, opts);
  } catch (err) {
    return {
      outcome: "error",
      journalId: "",
      dryRun: !blocks.liveEnabled,
      error: (err as Error).message,
    };
  }

  // The order actually placed (dry-run sink or live) → count it toward today's
  // ET-day order cap, so a later approval (or paper batch) sees it. Best-effort:
  // a counter write must never undo a placed order.
  await incrementOrdersToday({ dataDir: opts.dataDir, now }).catch(() => {});

  // Build the override audit trail — tags + a comment line on the trade entry —
  // ONLY when a real block was overridden.
  const overrideTags: string[] = [];
  const overrodeReasons: string[] = [];
  if (override && approvalIsBlocked(blocks)) {
    if (blocks.redTeamRejects) {
      overrideTags.push("override:red-team");
      overrodeReasons.push(
        `red-team reject (${blocks.redTeam?.notes ?? "no notes"})`,
      );
    }
    for (const v of blocks.railViolations) {
      overrideTags.push(`override:${v.rule}`);
      overrodeReasons.push(`rail ${v.rule}: ${v.message}`);
    }
    for (const v of blocks.capViolations) {
      overrideTags.push(`override:${v.rule}`);
      overrodeReasons.push(`live cap ${v.rule}: ${v.message}`);
    }
    overrideTags.push("human-override");
  }

  const sinkNote = placed.dryRun
    ? ` (dry-run sink — no real money; harness gate closed)`
    : "";
  const overrideNote =
    overrodeReasons.length > 0
      ? ` HUMAN OVERRIDE — comment: "${input.override!.comment.trim()}". Overrode: ${overrodeReasons.join("; ")}.`
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
      tags: [
        ...(order.tags ?? []),
        placed.dryRun ? "dry-run" : "live",
        "human-approved",
        ...overrideTags,
      ],
      thesis: order.thesis,
      research: order.research,
      redTeam: order.redTeam?.notes,
      decision: `Approved by ${approver}; routed to ${placed.destination}${sinkNote}. Broker order ${placed.brokerOrderId}.${overrideNote}`,
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
