import "server-only";

import { z } from "zod";
import { PortfolioSnapshotSchema } from "@/lib/schemas";
import type { PortfolioSnapshot, Position } from "@/lib/types";

/**
 * Server-only **read-only** client for the Robinhood Trading MCP
 * (`https://agent.robinhood.com/mcp/trading`). Phase 3 M1 wires the dashboard
 * LIVE panel to the real Robinhood Agentic account via the `get_portfolio`
 * tool — and **nothing else**. There is deliberately no order-placement path in
 * this module; the only tool it will ever call is in {@link READ_ONLY_TOOLS}.
 *
 * Connection is **default-off**: with no `ROBINHOOD_MCP_TOKEN` set, the client
 * reports "not connected" and the resolver renders the LIVE panel as OFF. The
 * account is unfunded and the harness order gate is closed until a deliberate
 * human action in a later, gated milestone (M5) — never the agent.
 *
 * The actual MCP round-trip is isolated behind an injectable
 * {@link PortfolioFetcher} so the mapping and resolver logic are unit-tested
 * without a network or a live account.
 */

/** The complete set of Robinhood MCP tools this build is allowed to call.
 *  Read-only by construction — order tools are intentionally absent.
 *
 *  **Privacy (Agentic-account only):** the Robinhood MCP grants read access to
 *  every account the user has linked, but the desk reads only `get_portfolio`,
 *  which returns the single Agentic account. We deliberately do NOT call
 *  account-enumeration tools (`get_accounts`, `get_equity_positions`, …), so the
 *  user's other Robinhood accounts are never fetched, aggregated, or displayed.
 *  Tools that would expose other accounts (or place an order) are listed in
 *  {@link FORBIDDEN_TOOLS}; a regression that adds one fails the unit test. */
export const READ_ONLY_TOOLS = ["get_portfolio"] as const;

/** Tools that would expose accounts beyond the Agentic one, or place an order.
 *  None of these may ever appear in {@link READ_ONLY_TOOLS}. */
export const FORBIDDEN_TOOLS = [
  "get_accounts",
  "get_equity_positions",
  "get_option_positions",
  "place_equity_order",
  "place_option_order",
] as const;

const MCP_URL =
  process.env.ROBINHOOD_MCP_URL ?? "https://agent.robinhood.com/mcp/trading";
const MCP_TOKEN = process.env.ROBINHOOD_MCP_TOKEN ?? "";
const TIMEOUT_MS = 8000;

/** True only when a Robinhood Agentic connection token is configured. The
 *  shipped default (no token) is "not connected" — live trading stays off. */
export function hasRobinhoodConnection(): boolean {
  return MCP_TOKEN.length > 0;
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

/** Injectable fetch of the raw `get_portfolio` result. The default talks to the
 *  MCP over HTTP; tests inject a fake so mapping stays network-free. */
export type PortfolioFetcher = () => Promise<unknown>;

/* ------------------------------- MCP transport ----------------------------- */

const McpToolResultSchema = z.object({
  result: z.object({
    // MCP tool results arrive as a content array; the portfolio JSON is the
    // text of the first text block (or already-structured `structuredContent`).
    structuredContent: z.unknown().optional(),
    content: z
      .array(z.object({ type: z.string(), text: z.string().optional() }))
      .optional(),
  }),
});

/**
 * Default MCP round-trip for `get_portfolio`. Single JSON-RPC `tools/call` with
 * a bearer token; the response is parsed as JSON or a single SSE `data:` frame.
 * Isolated and only reached when {@link hasRobinhoodConnection} is true, so the
 * shipped (token-less) build never executes it. The live wire shape is verified
 * during the gated M5 connection.
 */
async function defaultFetchPortfolio(): Promise<unknown> {
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${MCP_TOKEN}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_portfolio", arguments: {} },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `Robinhood MCP get_portfolio → ${res.status} ${res.statusText}`,
    );
  }

  const text = await res.text();
  // Streamable-HTTP MCP may answer as `text/event-stream`; take the last
  // `data:` frame. Plain JSON responses pass through unchanged.
  const payload = res.headers.get("content-type")?.includes("event-stream")
    ? lastSseData(text)
    : text;
  const envelope = McpToolResultSchema.parse(JSON.parse(payload));
  const { structuredContent, content } = envelope.result;
  if (structuredContent !== undefined) return structuredContent;
  const firstText = content?.find((c) => c.text)?.text;
  if (!firstText) {
    throw new Error("Robinhood MCP get_portfolio returned no content");
  }
  return JSON.parse(firstText);
}

function lastSseData(stream: string): string {
  const frames = stream
    .split(/\n\n/)
    .map((block) =>
      block
        .split(/\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .join(""),
    )
    .filter(Boolean);
  const last = frames.at(-1);
  if (!last) throw new Error("Robinhood MCP returned an empty SSE stream");
  return last;
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
