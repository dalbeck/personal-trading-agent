import "server-only";

import { z } from "zod";
import type { ProposedOrder } from "@/lib/risk";
import { PortfolioSnapshotSchema } from "@/lib/schemas";
import type { PortfolioSnapshot, Position } from "@/lib/types";

/**
 * Server-only Alpaca **paper** REST client. Credentials come from `.env` and
 * never reach the client. All calls are time-boxed and the responses are
 * zod-validated (external data is untrusted too). Mapping helpers translate
 * Alpaca's string-typed payloads into our internal contracts.
 */

const BASE_URL =
  process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
const KEY_ID = process.env.ALPACA_API_KEY_ID ?? "";
const SECRET = process.env.ALPACA_API_SECRET_KEY ?? "";
const TIMEOUT_MS = 6000;

export function hasAlpacaCredentials(): boolean {
  return KEY_ID.length > 0 && SECRET.length > 0;
}

async function alpacaGet<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<z.infer<S>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "APCA-API-KEY-ID": KEY_ID,
      "APCA-API-SECRET-KEY": SECRET,
      accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Alpaca ${path} → ${res.status} ${res.statusText}`);
  }
  return schema.parse(await res.json());
}

/* ----------------------------- API schemas ----------------------------- */
// Numeric fields arrive as strings; coerce. Unknown keys are stripped.

const AccountSchema = z.object({
  currency: z.string().default("USD"),
  cash: z.coerce.number(),
  equity: z.coerce.number(),
  last_equity: z.coerce.number(),
  buying_power: z.coerce.number(),
});

const ApiPositionSchema = z.object({
  symbol: z.string(),
  side: z.enum(["long", "short"]).catch("long"),
  qty: z.coerce.number(),
  avg_entry_price: z.coerce.number(),
  current_price: z.coerce.number().nullable().catch(null),
  market_value: z.coerce.number(),
  cost_basis: z.coerce.number(),
  unrealized_pl: z.coerce.number(),
  unrealized_plpc: z.coerce.number(),
});

const OrderSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  side: z.string(),
  qty: z.coerce.number().nullable().catch(null),
  status: z.string(),
  submitted_at: z.string().nullable().catch(null),
});
export type AlpacaOrder = z.infer<typeof OrderSchema>;

const HistorySchema = z.object({
  timestamp: z.array(z.number()),
  equity: z.array(z.number().nullable()),
});

/* ----------------------------- API calls ------------------------------- */

export function getAlpacaAccount() {
  return alpacaGet("/v2/account", AccountSchema);
}

export function getAlpacaPositions() {
  return alpacaGet("/v2/positions", z.array(ApiPositionSchema));
}

export function getAlpacaOrders(limit = 20) {
  return alpacaGet(
    `/v2/orders?status=all&limit=${limit}&direction=desc&nested=false`,
    z.array(OrderSchema),
  );
}

function getAlpacaHistory() {
  return alpacaGet(
    "/v2/account/portfolio/history?period=3M&timeframe=1D",
    HistorySchema,
  );
}

/* ------------------------------ mapping -------------------------------- */

export function mapPosition(p: z.infer<typeof ApiPositionSchema>): Position {
  const last = p.current_price ?? (p.qty !== 0 ? p.market_value / p.qty : 0);
  return {
    symbol: p.symbol,
    side: p.side,
    qty: Math.abs(p.qty),
    avgCost: p.avg_entry_price,
    lastPrice: last,
    marketValue: p.market_value,
    costBasis: p.cost_basis,
    unrealizedPl: p.unrealized_pl,
    unrealizedPlPct: p.unrealized_plpc,
    stopPrice: null,
    openedAt: new Date().toISOString().slice(0, 10),
  };
}

export function buildSnapshot(input: {
  account: z.infer<typeof AccountSchema>;
  positions: z.infer<typeof ApiPositionSchema>[];
  history?: z.infer<typeof HistorySchema> | null;
  asOf?: string;
}): PortfolioSnapshot {
  const { account, positions } = input;
  const mapped = positions.map(mapPosition);

  const totalUnrealized = mapped.reduce((s, p) => s + p.unrealizedPl, 0);
  const totalCost = mapped.reduce((s, p) => s + p.costBasis, 0);
  const dayPl = account.equity - account.last_equity;

  const equityCurve =
    input.history && input.history.timestamp.length
      ? input.history.timestamp
          .map((ts, i) => ({ ts, eq: input.history?.equity[i] ?? null }))
          .filter((p): p is { ts: number; eq: number } => p.eq !== null)
          .map((p) => ({
            date: new Date(p.ts * 1000).toISOString().slice(0, 10),
            equity: p.eq,
          }))
      : [];

  const snapshot = {
    account: "paper" as const,
    asOf: input.asOf ?? new Date().toISOString(),
    currency: account.currency || "USD",
    equity: account.equity,
    cash: account.cash,
    buyingPower: account.buying_power,
    totalPl: totalUnrealized,
    totalPlPct: totalCost !== 0 ? totalUnrealized / totalCost : 0,
    dayPl,
    dayPlPct: account.last_equity !== 0 ? dayPl / account.last_equity : 0,
    positions: mapped,
    equityCurve,
  };

  // Validate the mapped shape against our own contract before returning.
  return PortfolioSnapshotSchema.parse(snapshot);
}

/** Live paper snapshot from Alpaca. Throws on network/auth/validation error. */
export async function getAlpacaPaperSnapshot(): Promise<PortfolioSnapshot> {
  const [account, positions] = await Promise.all([
    getAlpacaAccount(),
    getAlpacaPositions(),
  ]);
  // History is best-effort; a failure shouldn't sink the whole snapshot.
  const history = await getAlpacaHistory().catch(() => null);
  return buildSnapshot({ account, positions, history });
}

/* ----------------------------- Order placement ----------------------------- */

const OrderResponseSchema = z.object({
  id: z.string(),
  status: z.string().default("accepted"),
});

export interface PlacedOrder {
  brokerOrderId: string;
  status: string;
}

/**
 * Place a single **paper** order on Alpaca. Marketable-limit only (charter); a
 * protective stop is attached as a bracket order. `fetchImpl` is injectable so
 * the execution pipeline can be tested without the network. This is the ONLY
 * order-placement path and it targets the paper endpoint — never live.
 */
export async function placePaperOrder(
  order: ProposedOrder,
  opts?: { fetchImpl?: typeof fetch },
): Promise<PlacedOrder> {
  const doFetch = opts?.fetchImpl ?? fetch;

  const body: Record<string, unknown> = {
    symbol: order.symbol,
    qty: order.qty,
    side: order.action, // "buy" | "sell"
    type: "limit", // marketable-limit: a limit priced to fill now
    time_in_force: "day",
    limit_price: order.limitPrice,
  };
  // Attach the protective stop as a bracket on entries that carry one.
  if (order.action === "buy" && order.stopPrice !== null) {
    body.order_class = "bracket";
    body.stop_loss = { stop_price: order.stopPrice };
  }

  const res = await doFetch(`${BASE_URL}/v2/orders`, {
    method: "POST",
    headers: {
      "APCA-API-KEY-ID": KEY_ID,
      "APCA-API-SECRET-KEY": SECRET,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Alpaca order rejected → ${res.status} ${res.statusText} ${detail.slice(0, 200)}`,
    );
  }

  const parsed = OrderResponseSchema.parse(await res.json());
  return { brokerOrderId: parsed.id, status: parsed.status };
}
