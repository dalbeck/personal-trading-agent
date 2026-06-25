import "server-only";

import { z } from "zod";
import type { ProposedOrder } from "@/lib/risk";
import { PortfolioSnapshotSchema } from "@/lib/schemas";
import type { EquityPoint, PortfolioSnapshot, Position } from "@/lib/types";

/**
 * Server-only Alpaca **paper** REST client. Credentials come from `.env` and
 * never reach the client. All calls are time-boxed and the responses are
 * zod-validated (external data is untrusted too). Mapping helpers translate
 * Alpaca's string-typed payloads into our internal contracts.
 */

const BASE_URL =
  process.env.ALPACA_BASE_URL ?? "https://paper-api.alpaca.markets";
// Market data lives on a separate host from the trading API.
const DATA_BASE_URL =
  process.env.ALPACA_DATA_URL ?? "https://data.alpaca.markets";
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

// One Alpaca trading session. `open`/`close` are ET wall-clock "HH:MM" and
// already reflect half-day early closes; holidays are simply absent. Extra
// keys (e.g. settlement_date) are stripped.
const CalendarDaySchema = z.object({
  date: z.string(),
  open: z.string(),
  close: z.string(),
});
export type AlpacaCalendarDay = z.infer<typeof CalendarDaySchema>;

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

/**
 * Trading-session calendar over [start, end] (ISO dates). Half-day and holiday
 * aware by construction — early closes carry an earlier `close`, holidays are
 * omitted. Throws on network/auth/validation error; callers fall back to a
 * labeled regular-hours approximation.
 */
export function getAlpacaCalendar(start: string, end: string) {
  return alpacaGet(
    `/v2/calendar?start=${start}&end=${end}`,
    z.array(CalendarDaySchema),
  );
}

/* ------------------------- market data: daily bars ------------------------ */
// Daily OHLC bars from the data API (separate host). Only the close is used —
// for the benchmark (e.g. SPY) return/drawdown curve on the evaluation
// scorecard. Research/benchmark only; never order pricing or execution.

const BarSchema = z.object({ t: z.string(), c: z.number() });
const BarsResponseSchema = z.object({
  bars: z.array(BarSchema).nullable().catch(null),
  next_page_token: z.string().nullable().catch(null),
});

/** Map raw daily bars → an `EquityPoint[]` close series (date, equity=close). */
export function mapBarsToCloses(
  bars: z.infer<typeof BarSchema>[],
): EquityPoint[] {
  return bars.map((b) => ({ date: b.t.slice(0, 10), equity: b.c }));
}

/**
 * Daily closing prices for `symbol` over [start, end] (ISO dates), oldest →
 * newest, as an `EquityPoint[]`. Paginates the data API (capped). Throws on
 * network/auth/validation error — callers treat the benchmark series as
 * best-effort and fall back when it's unavailable.
 */
export async function getDailyCloses(
  symbol: string,
  start: string,
  end: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<EquityPoint[]> {
  const doFetch = opts?.fetchImpl ?? fetch;
  const closes: EquityPoint[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      timeframe: "1Day",
      start,
      end,
      adjustment: "all",
      limit: "1000",
    });
    if (pageToken) params.set("page_token", pageToken);

    const res = await doFetch(
      `${DATA_BASE_URL}/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`,
      {
        headers: {
          "APCA-API-KEY-ID": KEY_ID,
          "APCA-API-SECRET-KEY": SECRET,
          accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Alpaca data /v2/stocks/${symbol}/bars → ${res.status} ${res.statusText}`,
      );
    }
    const parsed = BarsResponseSchema.parse(await res.json());
    closes.push(...mapBarsToCloses(parsed.bars ?? []));
    pageToken = parsed.next_page_token;
    if (!pageToken) break;
  }

  return closes;
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

/* ---------------- market data: snapshot / bars / news (symbol view) -------- */
// Powers the /symbol/[ticker] view. Free Alpaca accounts get the **IEX** feed
// (not the consolidated SIP tape), so we request `feed=iex` explicitly and label
// it honestly in the UI. Display / research only — never order pricing.

const DATA_FEED = process.env.ALPACA_DATA_FEED ?? "iex";

async function alpacaDataGet<S extends z.ZodType>(
  path: string,
  schema: S,
  opts?: { fetchImpl?: typeof fetch },
): Promise<z.infer<S>> {
  const doFetch = opts?.fetchImpl ?? fetch;
  const res = await doFetch(`${DATA_BASE_URL}${path}`, {
    headers: {
      "APCA-API-KEY-ID": KEY_ID,
      "APCA-API-SECRET-KEY": SECRET,
      accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Alpaca data ${path} → ${res.status} ${res.statusText}`);
  }
  return schema.parse(await res.json());
}

// One OHLCV bar. Unknown keys (n, vw) are stripped.
const OhlcBarSchema = z.object({
  t: z.string(),
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
});
export type AlpacaOhlcBar = z.infer<typeof OhlcBarSchema>;

const OhlcBarsResponseSchema = z.object({
  bars: z.array(OhlcBarSchema).nullable().catch(null),
  next_page_token: z.string().nullable().catch(null),
});

// A single bar inside the snapshot payload (timestamp optional there).
const SnapshotBarSchema = z.object({
  o: z.number(),
  h: z.number(),
  l: z.number(),
  c: z.number(),
  v: z.number(),
  t: z.string().optional(),
});
const SnapshotResponseSchema = z.object({
  latestTrade: z
    .object({ p: z.number(), t: z.string() })
    .nullable()
    .catch(null),
  dailyBar: SnapshotBarSchema.nullable().catch(null),
  prevDailyBar: SnapshotBarSchema.nullable().catch(null),
  minuteBar: SnapshotBarSchema.nullable().catch(null),
});
export type AlpacaSnapshot = z.infer<typeof SnapshotResponseSchema>;

const NewsItemSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  headline: z.string(),
  source: z.string().default(""),
  url: z.string().default(""),
  created_at: z.string(),
});
export type AlpacaNewsItem = z.infer<typeof NewsItemSchema>;
const NewsResponseSchema = z.object({
  news: z.array(NewsItemSchema).nullable().catch(null),
});

export interface BarsWindow {
  timeframe: string; // Alpaca timeframe, e.g. "5Min", "30Min", "1Day"
  start: string; // RFC3339 / ISO
  end?: string;
}

/**
 * OHLCV bars for `symbol` over a window, oldest → newest. Paginates the IEX
 * data feed (capped). Throws on network/auth/validation error — symbol-view
 * callers fall back to an empty series and a degraded notice.
 */
export async function getStockBars(
  symbol: string,
  window: BarsWindow,
  opts?: { fetchImpl?: typeof fetch },
): Promise<AlpacaOhlcBar[]> {
  const doFetch = opts?.fetchImpl ?? fetch;
  const bars: AlpacaOhlcBar[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < 5; page++) {
    const params = new URLSearchParams({
      timeframe: window.timeframe,
      start: window.start,
      feed: DATA_FEED,
      adjustment: "all",
      limit: "10000",
      sort: "asc",
    });
    if (window.end) params.set("end", window.end);
    if (pageToken) params.set("page_token", pageToken);

    const res = await doFetch(
      `${DATA_BASE_URL}/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`,
      {
        headers: {
          "APCA-API-KEY-ID": KEY_ID,
          "APCA-API-SECRET-KEY": SECRET,
          accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      throw new Error(
        `Alpaca data /v2/stocks/${symbol}/bars → ${res.status} ${res.statusText}`,
      );
    }
    const parsed = OhlcBarsResponseSchema.parse(await res.json());
    bars.push(...(parsed.bars ?? []));
    pageToken = parsed.next_page_token;
    if (!pageToken) break;
  }

  return bars;
}

/** IEX snapshot (latest trade + daily/prev-daily/minute bars) for `symbol`. */
export function getStockSnapshot(
  symbol: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<AlpacaSnapshot> {
  const params = new URLSearchParams({ feed: DATA_FEED });
  return alpacaDataGet(
    `/v2/stocks/${encodeURIComponent(symbol)}/snapshot?${params}`,
    SnapshotResponseSchema,
    opts,
  );
}

/** Recent news headlines for `symbol` from Alpaca's news feed (newest first). */
export async function getStockNews(
  symbol: string,
  limit = 10,
  opts?: { fetchImpl?: typeof fetch },
): Promise<AlpacaNewsItem[]> {
  const params = new URLSearchParams({
    symbols: symbol,
    limit: String(limit),
    sort: "desc",
  });
  const data = await alpacaDataGet(
    `/v1beta1/news?${params}`,
    NewsResponseSchema,
    opts,
  );
  return data.news ?? [];
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
  opts?: { fetchImpl?: typeof fetch; clientOrderId?: string },
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
  // Pass the stable client order id so the broker itself de-dups a retry
  // (Alpaca rejects a duplicate client_order_id). Belt to our own record's
  // suspenders. Alpaca caps this at 128 chars.
  if (opts?.clientOrderId) {
    body.client_order_id = opts.clientOrderId.slice(0, 128);
  }
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
