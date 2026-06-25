import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { PortfolioSnapshotSchema } from "@/lib/schemas";
import type { PortfolioSnapshot, Position } from "@/lib/types";
import {
  coerceIntLike,
  coerceMoneyLike,
  coerceNumberLike,
  coercePercentLike,
  coerceStr,
} from "./research/parse";
import type {
  ResearchFundamentals,
  ResearchProfile,
} from "./research/types";
import { ROBINHOOD_MCP_SERVER } from "./gate";

const run = promisify(execFile);

/**
 * Server-only **read-only** client for the Robinhood Trading MCP
 * (`https://agent.robinhood.com/mcp/trading`). It wires the dashboard LIVE panel
 * to the real Robinhood Agentic account by reading `get_portfolio` /
 * `get_equity_positions` for **one specific account** — and **nothing else**.
 * There is deliberately no order-placement path in this module; the only tools
 * it will ever call are in {@link READ_ONLY_TOOLS}.
 *
 * **Transport — through the host `claude` CLI's MCP session, not a token.** The
 * Robinhood Agentic MCP authenticates via OAuth (the `claude mcp add` browser
 * authorize flow), which yields no static bearer token to configure. So instead
 * of its own HTTP+token round-trip, the dashboard reaches the account through
 * the already-authenticated `claude` CLI (the same host-CLI pattern the chat and
 * red-team use): it spawns `claude -p` with the read-only tool(s) allow-listed
 * and asks it to return the portfolio as JSON. Order tools are NEVER allow-listed.
 *
 * **Privacy (Agentic-account only):** the MCP grants read access to every linked
 * account, but the desk reads only the ONE account named by
 * `ROBINHOOD_AGENTIC_ACCOUNT_NUMBER`. It never calls `get_accounts` (the
 * enumeration tool) — both because the allow-list omits it and because the
 * account number is supplied directly — so the user's other accounts are never
 * fetched, aggregated, or displayed.
 *
 * Connection is **default-off**: with no `ROBINHOOD_AGENTIC_ACCOUNT_NUMBER` set,
 * the client reports "not connected" and the resolver renders the LIVE panel as
 * OFF. Reading the account changes **no** trade gate — the harness order gate
 * stays closed until a deliberate, separately-gated human action (M5).
 *
 * The actual fetch is isolated behind an injectable {@link PortfolioFetcher} so
 * the mapping and resolver logic are unit-tested without spawning a CLI or
 * touching a live account.
 */

/** The complete set of Robinhood MCP tools this build is allowed to call —
 *  read-only and **account-scoped** (each is invoked with the configured Agentic
 *  account number). `get_equity_orders` is read-only order *history* (used to
 *  ingest the human's manual live trades for coaching, M2) — it places nothing.
 *  Order-placement tools are intentionally absent; a regression that adds one —
 *  or an enumeration tool — fails the unit test against {@link FORBIDDEN_TOOLS}. */
export const READ_ONLY_TOOLS = [
  "get_portfolio",
  "get_equity_positions",
  "get_equity_orders",
] as const;

/** Read-only **market-data** tools — symbol-scoped, NOT account-scoped (no
 *  account number is referenced). `get_equity_fundamentals` returns valuation
 *  ratios, market cap, dividend schedule, and a company profile — the free
 *  source for the symbol page's stats grid + profile rail. It places nothing and
 *  reads no account, so it is kept separate from the account-scoped
 *  {@link READ_ONLY_TOOLS}; like them, none of {@link FORBIDDEN_TOOLS} may leak in. */
export const MARKET_DATA_TOOLS = ["get_equity_fundamentals"] as const;

/** Tools that must NEVER be allow-listed: `get_accounts` enumerates every linked
 *  account (breaks Agentic-only privacy), and the order tools place real trades.
 *  None of these may appear in {@link READ_ONLY_TOOLS} or in the spawned argv. */
export const FORBIDDEN_TOOLS = [
  "get_accounts",
  "place_equity_order",
  "place_option_order",
  "cancel_equity_order",
  "cancel_option_order",
] as const;

/** The MCP server name as registered with the host `claude` CLI. Tool ids are
 *  namespaced `mcp__<server>__<tool>`. Single-sourced in `gate.ts` so the
 *  read-only client, the gate, and the order path can never drift apart. */
const MCP_SERVER = ROBINHOOD_MCP_SERVER;

/** The single Agentic account the dashboard is allowed to read. Empty ⇒ not
 *  connected (the shipped default). The human sets this in `.env` once they have
 *  the account number; the agent cannot discover it (no enumeration). */
const AGENTIC_ACCOUNT = process.env.ROBINHOOD_AGENTIC_ACCOUNT_NUMBER ?? "";

/** How long to wait for the `claude` CLI portfolio read before giving up and
 *  falling back to the last persisted live snapshot. */
const CLI_TIMEOUT_MS = 90_000;

/** True only when an Agentic account number is configured. The shipped default
 *  (unset) is "not connected" — the LIVE panel renders OFF. */
export function hasRobinhoodConnection(): boolean {
  return AGENTIC_ACCOUNT.length > 0;
}

/* --------------------------- get_portfolio shape --------------------------- */
// Defensive contract for the `get_portfolio` result. External data is
// untrusted, so every field is validated and coerced; unknown keys are
// stripped. The exact wire shape is confirmed against the live MCP during the
// gated M5 connection — until then this is the read-only mapping target.

const RhPositionSchema = z
  .object({
    symbol: z.string(),
    quantity: z.coerce.number(),
    side: z.enum(["long", "short"]).catch("long"),
    average_buy_price: z.coerce.number().catch(0),
    last_price: z.coerce.number().nullable().catch(null),
    market_value: z.coerce.number().catch(0),
    cost_basis: z.coerce.number().catch(0),
    unrealized_pl: z.coerce.number().catch(0),
    unrealized_pl_pct: z.coerce.number().catch(0),
  })
  .passthrough();

export const RobinhoodPortfolioSchema = z
  .object({
    currency: z.string().default("USD"),
    equity: z.coerce.number(),
    cash: z.coerce.number(),
    buying_power: z.coerce.number(),
    last_equity: z.coerce.number().nullable().catch(null),
    positions: z.array(RhPositionSchema).default([]),
  })
  .passthrough();

export type RobinhoodPortfolio = z.infer<typeof RobinhoodPortfolioSchema>;

/** Injectable fetch of the raw portfolio object (already mapped to our
 *  {@link RobinhoodPortfolioSchema} shape). The default spawns the host `claude`
 *  CLI; tests inject a fake so mapping/resolver stay CLI-free. */
export type PortfolioFetcher = () => Promise<unknown>;

/* --------------------------- CLI-bridge transport -------------------------- */

/** Fully-namespaced MCP tool id (`mcp__<server>__<tool>`). */
function toolId(tool: string): string {
  return `mcp__${MCP_SERVER}__${tool}`;
}

/**
 * Build the `claude -p` argv that reads ONE account's portfolio through the
 * host CLI's authenticated Robinhood MCP session. Pure + exported so the safety
 * invariants are unit-tested without spawning: only the read-only tools are
 * allow-listed, every order/enumeration tool is explicitly disallowed, and the
 * account number is the only account ever referenced.
 */
export function buildPortfolioCliCommand(account: string): {
  cmd: string;
  args: string[];
} {
  const prompt = [
    `Use the ${MCP_SERVER} MCP. Read ONLY brokerage account ${account}.`,
    `Do NOT call get_accounts, do NOT place or cancel any order.`,
    `Steps: (1) call get_portfolio with account_number "${account}";`,
    `(2) call get_equity_positions with account_number "${account}".`,
    `Then output ONLY a single minified JSON object — no prose, no markdown` +
      ` fences — with EXACTLY these keys, copying values verbatim from the tool` +
      ` results (never compute, estimate, or invent a number; use null for an` +
      ` unavailable last_equity/last_price and 0 for any other missing number):`,
    `{"currency":"USD","equity":NUMBER,"cash":NUMBER,"buying_power":NUMBER,` +
      `"last_equity":NUMBER_OR_NULL,"positions":[{"symbol":STRING,` +
      `"quantity":NUMBER,"side":"long"|"short","average_buy_price":NUMBER,` +
      `"last_price":NUMBER_OR_NULL,"market_value":NUMBER,"cost_basis":NUMBER,` +
      `"unrealized_pl":NUMBER,"unrealized_pl_pct":NUMBER}]}`,
  ].join(" ");

  return {
    cmd: "claude",
    args: [
      "-p",
      prompt,
      "--allowedTools",
      ...READ_ONLY_TOOLS.map(toolId),
      "--disallowedTools",
      ...FORBIDDEN_TOOLS.map(toolId),
    ],
  };
}

/** Pull the first balanced JSON object out of CLI stdout (the model is asked for
 *  bare JSON, but tolerate stray prose / code fences defensively). */
function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("Robinhood CLI read returned no JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Default portfolio fetch: spawn the host `claude` CLI (argv, never a shell) to
 * read the configured Agentic account through its authenticated MCP session.
 * Only reached when {@link hasRobinhoodConnection} is true. Throws on timeout /
 * non-zero exit / unparseable output, so the resolver falls back to the last
 * persisted live snapshot rather than rendering nothing.
 */
async function defaultFetchPortfolio(): Promise<unknown> {
  if (!AGENTIC_ACCOUNT) {
    throw new Error("ROBINHOOD_AGENTIC_ACCOUNT_NUMBER is not set");
  }
  const { cmd, args } = buildPortfolioCliCommand(AGENTIC_ACCOUNT);
  const { stdout } = await run(cmd, args, {
    cwd: process.cwd(),
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  return extractJsonObject(stdout);
}

/* --------------------------------- mapping --------------------------------- */

function mapRhPosition(p: RobinhoodPortfolio["positions"][number]): Position {
  const qty = Math.abs(p.quantity);
  const last =
    p.last_price ?? (qty !== 0 ? p.market_value / (p.quantity || 1) : 0);
  return {
    symbol: p.symbol,
    side: p.side,
    qty,
    avgCost: p.average_buy_price,
    lastPrice: last,
    marketValue: p.market_value,
    costBasis: p.cost_basis,
    unrealizedPl: p.unrealized_pl,
    unrealizedPlPct: p.unrealized_pl_pct,
    stopPrice: null,
    openedAt: new Date().toISOString().slice(0, 10),
  };
}

/** Map a validated `get_portfolio` result into our internal **live** snapshot
 *  contract. Validates the final shape before returning. */
export function buildLiveSnapshot(
  portfolio: RobinhoodPortfolio,
  asOf: string,
): PortfolioSnapshot {
  const positions = portfolio.positions.map(mapRhPosition);
  const totalUnrealized = positions.reduce((s, p) => s + p.unrealizedPl, 0);
  const totalCost = positions.reduce((s, p) => s + p.costBasis, 0);
  const lastEquity = portfolio.last_equity ?? portfolio.equity;
  const dayPl = portfolio.equity - lastEquity;

  const snapshot = {
    account: "live" as const,
    asOf,
    currency: portfolio.currency || "USD",
    equity: portfolio.equity,
    cash: portfolio.cash,
    buyingPower: portfolio.buying_power,
    totalPl: totalUnrealized,
    totalPlPct: totalCost !== 0 ? totalUnrealized / totalCost : 0,
    dayPl,
    dayPlPct: lastEquity !== 0 ? dayPl / lastEquity : 0,
    positions,
    equityCurve: [],
  };

  return PortfolioSnapshotSchema.parse(snapshot);
}

/**
 * Fetch the live Robinhood portfolio and map it to a snapshot. Throws if the
 * connection is not configured (callers gate on {@link hasRobinhoodConnection}).
 * `fetcher` is injectable for tests.
 */
export async function getRobinhoodLiveSnapshot(opts?: {
  fetcher?: PortfolioFetcher;
  asOf?: string;
}): Promise<PortfolioSnapshot> {
  if (!opts?.fetcher && !hasRobinhoodConnection()) {
    throw new Error("Robinhood Agentic account is not connected");
  }
  const raw = await (opts?.fetcher ?? defaultFetchPortfolio)();
  const portfolio = RobinhoodPortfolioSchema.parse(raw);
  return buildLiveSnapshot(portfolio, opts?.asOf ?? new Date().toISOString());
}

/* --------------------- get_equity_orders (read-only history) --------------- */
// Read-only ingestion of the human's MANUAL live trades for coaching (M2).
// `get_equity_orders` returns order *history* — it places nothing. We keep only
// FILLED orders and map them to a minimal trade record; everything else is the
// same Agentic-account-only, defensive-parse pattern as the portfolio read.

const RhOrderSchema = z
  .object({
    id: z.string(),
    symbol: z.string(),
    side: z.enum(["buy", "sell"]).catch("buy"),
    quantity: z.coerce.number().catch(0),
    average_price: z.coerce.number().nullable().catch(null),
    state: z.string().catch(""), // "filled" | "cancelled" | "rejected" | …
    filled_at: z.string().nullable().catch(null),
    created_at: z.string().nullable().catch(null),
  })
  .passthrough();

export const RobinhoodOrdersSchema = z
  .object({ orders: z.array(RhOrderSchema).default([]) })
  .passthrough();

export type RobinhoodOrders = z.infer<typeof RobinhoodOrdersSchema>;

/** A single executed manual live trade, mapped from Robinhood order history. */
export interface LiveTrade {
  /** The broker order id — the stable dedupe key for idempotent ingestion. */
  orderId: string;
  symbol: string;
  action: "buy" | "sell";
  qty: number;
  price: number;
  /** ISO timestamp of the fill (falls back to created_at, else now). */
  filledAt: string;
}

export type OrdersFetcher = () => Promise<unknown>;

/**
 * Build the `claude -p` argv that reads ONE account's equity order history
 * through the host CLI. Pure + exported so the safety invariants are unit-tested
 * without spawning: only read-only tools are allow-listed, every
 * order-placement / enumeration tool is explicitly disallowed, and the account
 * number is the only account ever referenced. `get_equity_orders` is read-only.
 */
export function buildOrdersCliCommand(account: string): {
  cmd: string;
  args: string[];
} {
  const prompt = [
    `Use the ${MCP_SERVER} MCP. Read ONLY brokerage account ${account}.`,
    `Do NOT call get_accounts, do NOT place or cancel any order.`,
    `Call get_equity_orders with account_number "${account}" to read order` +
      ` history (this is READ-ONLY; it places nothing).`,
    `Then output ONLY a single minified JSON object — no prose, no markdown` +
      ` fences — copying values verbatim from the tool result (never compute or` +
      ` invent a number; use null for an unavailable timestamp/price):`,
    `{"orders":[{"id":STRING,"symbol":STRING,"side":"buy"|"sell",` +
      `"quantity":NUMBER,"average_price":NUMBER_OR_NULL,"state":STRING,` +
      `"filled_at":STRING_OR_NULL,"created_at":STRING_OR_NULL}]}`,
  ].join(" ");

  return {
    cmd: "claude",
    args: [
      "-p",
      prompt,
      "--allowedTools",
      ...READ_ONLY_TOOLS.map(toolId),
      "--disallowedTools",
      ...FORBIDDEN_TOOLS.map(toolId),
    ],
  };
}

async function defaultFetchOrders(): Promise<unknown> {
  if (!AGENTIC_ACCOUNT) {
    throw new Error("ROBINHOOD_AGENTIC_ACCOUNT_NUMBER is not set");
  }
  const { cmd, args } = buildOrdersCliCommand(AGENTIC_ACCOUNT);
  const { stdout } = await run(cmd, args, {
    cwd: process.cwd(),
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  return extractJsonObject(stdout);
}

/** Keep only filled orders with a usable qty + price, mapped to {@link LiveTrade}. */
export function mapLiveTrades(orders: RobinhoodOrders): LiveTrade[] {
  const out: LiveTrade[] = [];
  for (const o of orders.orders) {
    if (o.state.toLowerCase() !== "filled") continue;
    const qty = Math.abs(o.quantity);
    if (qty === 0 || o.average_price === null || o.average_price <= 0) continue;
    out.push({
      orderId: o.id,
      symbol: o.symbol,
      action: o.side,
      qty,
      price: o.average_price,
      filledAt: o.filled_at ?? o.created_at ?? new Date().toISOString(),
    });
  }
  return out;
}

/**
 * Fetch the live account's executed (filled) trades from Robinhood order
 * history. Read-only — it can never place an order. Throws if the connection is
 * not configured (callers gate on {@link hasRobinhoodConnection}). `fetcher` is
 * injectable for tests so mapping is verified without a CLI or a live account.
 */
export async function getRobinhoodLiveTrades(opts?: {
  fetcher?: OrdersFetcher;
}): Promise<LiveTrade[]> {
  if (!opts?.fetcher && !hasRobinhoodConnection()) {
    throw new Error("Robinhood Agentic account is not connected");
  }
  const raw = await (opts?.fetcher ?? defaultFetchOrders)();
  return mapLiveTrades(RobinhoodOrdersSchema.parse(raw));
}

/* --------------------- get_equity_fundamentals (market data) --------------- */
// Read-only, symbol-scoped market data — the FREE source for the symbol page's
// fundamentals + company profile (no metered Perplexity call). It places nothing
// and reads no account: the prompt references no account number and forbids
// get_accounts / order tools, allow-listing ONLY get_equity_fundamentals.

const RhFundamentalsSchema = z
  .object({
    symbol: z.string().catch(""),
    market_cap: z.union([z.string(), z.number()]).nullable().catch(null),
    pe_ratio: z.union([z.string(), z.number()]).nullable().catch(null),
    dividend_yield: z.union([z.string(), z.number()]).nullable().catch(null),
    ceo: z.string().nullable().catch(null),
    num_employees: z.union([z.string(), z.number()]).nullable().catch(null),
    sector: z.string().nullable().catch(null),
    industry: z.string().nullable().catch(null),
    description: z.string().nullable().catch(null),
  })
  .passthrough();

export type RobinhoodFundamentals = z.infer<typeof RhFundamentalsSchema>;

export type FundamentalsFetcher = (symbol: string) => Promise<unknown>;

/**
 * Build the `claude -p` argv that reads one symbol's fundamentals through the
 * host CLI. Pure + exported so the safety invariants are unit-tested without
 * spawning: ONLY `get_equity_fundamentals` is allow-listed, every order /
 * enumeration tool is explicitly disallowed, and — unlike the account reads — no
 * account number is referenced (this is market data).
 */
export function buildFundamentalsCliCommand(symbol: string): {
  cmd: string;
  args: string[];
} {
  const prompt = [
    `Use the ${MCP_SERVER} MCP for READ-ONLY market data.`,
    `Do NOT call get_accounts, do NOT read any brokerage account, do NOT place or cancel any order.`,
    `Call get_equity_fundamentals with symbols ["${symbol}"] (this places nothing).`,
    `Then output ONLY a single minified JSON object — no prose, no markdown` +
      ` fences — copying values verbatim from the tool result (never compute,` +
      ` estimate, or invent a value; use null for anything unavailable):`,
    `{"symbol":"${symbol}","market_cap":NUMBER_OR_NULL,"pe_ratio":NUMBER_OR_NULL,` +
      `"dividend_yield":NUMBER_OR_NULL,"ceo":STRING_OR_NULL,` +
      `"num_employees":NUMBER_OR_NULL,"sector":STRING_OR_NULL,` +
      `"industry":STRING_OR_NULL,"description":STRING_OR_NULL}`,
  ].join(" ");

  return {
    cmd: "claude",
    args: [
      "-p",
      prompt,
      "--allowedTools",
      ...MARKET_DATA_TOOLS.map(toolId),
      "--disallowedTools",
      ...FORBIDDEN_TOOLS.map(toolId),
    ],
  };
}

/** Trim a long company blurb to a tidy rail-sized sentence (~240 chars). */
function tidyDescription(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.length <= 240) return raw;
  const cut = raw.slice(0, 240);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : 240).trimEnd()}…`;
}

/**
 * Map a validated `get_equity_fundamentals` result into the structured
 * fundamentals + profile the symbol page renders. Robinhood does not supply EPS,
 * exchange, IPO date, or analyst consensus — those stay null (Perplexity may fill
 * them). `dividend_yield` arrives as a percent value (0.36 === 0.36%), coerced to
 * a fraction. Returns null when the symbol carried no usable data.
 */
export function mapRobinhoodFundamentals(raw: RobinhoodFundamentals): {
  fundamentals: ResearchFundamentals;
  profile: ResearchProfile;
} | null {
  const fundamentals: ResearchFundamentals = {
    marketCap: coerceMoneyLike(raw.market_cap),
    peRatio: coerceNumberLike(raw.pe_ratio),
    eps: null,
    dividendYield: coercePercentLike(raw.dividend_yield),
  };
  const profile: ResearchProfile = {
    ceo: coerceStr(raw.ceo),
    employees: coerceIntLike(raw.num_employees),
    sector: coerceStr(raw.sector),
    industry: coerceStr(raw.industry),
    country: null,
    exchange: null,
    ipoDate: null,
    description: tidyDescription(coerceStr(raw.description)),
  };
  const anyValue =
    Object.values(fundamentals).some((v) => v !== null) ||
    Object.values(profile).some((v) => v !== null);
  return anyValue ? { fundamentals, profile } : null;
}

async function defaultFetchFundamentals(symbol: string): Promise<unknown> {
  const { cmd, args } = buildFundamentalsCliCommand(symbol);
  const { stdout } = await run(cmd, args, {
    cwd: process.cwd(),
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  return extractJsonObject(stdout);
}

/**
 * Fetch one symbol's fundamentals + profile from Robinhood (read-only, no
 * account, no metered cost). Gated on {@link hasRobinhoodConnection} (the same
 * connection the LIVE panel uses) unless a `fetcher` is injected for tests.
 * Best-effort: returns null on any failure so the caller falls back to Perplexity
 * or "—" rather than throwing.
 */
export async function getRobinhoodFundamentals(
  symbol: string,
  opts?: { fetcher?: FundamentalsFetcher },
): Promise<{
  fundamentals: ResearchFundamentals;
  profile: ResearchProfile;
} | null> {
  if (!opts?.fetcher && !hasRobinhoodConnection()) return null;
  try {
    const raw = await (opts?.fetcher ?? defaultFetchFundamentals)(symbol);
    return mapRobinhoodFundamentals(RhFundamentalsSchema.parse(raw));
  } catch {
    return null;
  }
}
