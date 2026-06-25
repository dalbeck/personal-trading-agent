import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  getRobinhoodLiveTrades,
  hasRobinhoodConnection,
  type LiveTrade,
  type OrdersFetcher,
} from "./robinhood";
import { recordTradeDecision } from "./writers";

/**
 * Ingest the human's **manual live trades** from Robinhood order history
 * (read-only) and journal them as `account: "live"`, `manual: true` so Coaching
 * can review them (M2). This NEVER places an order — it only reads filled-order
 * history through the read-only client and writes journal entries.
 *
 * Idempotent: synced order ids are tracked in `data/control/live-trades.json`,
 * so repeated runs only journal genuinely new fills. Default-off + best-effort,
 * mirroring `getLiveAccount`/`refreshLiveAccount`: with no Robinhood connection
 * it is a no-op, and any read/write failure degrades to "nothing ingested"
 * rather than throwing.
 */
function dataRoot(opts?: { dataDir?: string }): string {
  return (
    opts?.dataDir ??
    process.env.TRADING_DATA_DIR ??
    path.join(process.cwd(), "data")
  );
}

function syncStatePath(root: string): string {
  return path.join(root, "control", "live-trades.json");
}

/** The broker order ids already journaled (dedupe key for idempotent sync). */
async function readSyncedIds(root: string): Promise<Set<string>> {
  try {
    const parsed = JSON.parse(await readFile(syncStatePath(root), "utf8")) as {
      orderIds?: unknown;
    };
    const ids = Array.isArray(parsed.orderIds)
      ? parsed.orderIds.filter((x): x is string => typeof x === "string")
      : [];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

async function writeSyncedIds(
  root: string,
  ids: Set<string>,
  at: string,
): Promise<void> {
  const file = syncStatePath(root);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify({ orderIds: [...ids], updatedAt: at }, null, 2)}\n`,
    "utf8",
  );
}

/** Journal one manual live trade. Marked `account: "live"`, `manual: true` and
 *  tagged so the journal/coaching views can label it as human-executed. */
async function journalLiveTrade(
  trade: LiveTrade,
  opts?: { dataDir?: string },
): Promise<void> {
  const verb = trade.action.toUpperCase();
  await recordTradeDecision(
    {
      timestamp: trade.filledAt,
      symbol: trade.symbol,
      account: "live",
      manual: true,
      action: trade.action,
      qty: trade.qty,
      price: trade.price,
      reviewDate: trade.filledAt.slice(0, 10),
      tags: ["manual-live"],
      thesis: `Manual live trade executed by hand in Robinhood — ${verb} ${trade.qty} ${trade.symbol} @ ${trade.price}.`,
      decision:
        "Ingested read-only from Robinhood order history for coaching. The desk did not place this order.",
    },
    { dataDir: opts?.dataDir },
  );
}

export interface LiveTradeSyncResult {
  /** True when a Robinhood connection (or an injected fetcher) was available. */
  connected: boolean;
  /** Filled trades read from order history this run. */
  fetched: number;
  /** Newly journaled (previously-unseen) manual live trades. */
  ingested: number;
}

/**
 * Sync manual live trades into the decision journal. Read-only + best-effort +
 * idempotent. `fetcher` is injectable so the flow is unit-tested without a CLI
 * or a live account; `at` stamps the sync-state file deterministically.
 */
export async function syncLiveTrades(opts?: {
  fetcher?: OrdersFetcher;
  dataDir?: string;
  at?: string;
}): Promise<LiveTradeSyncResult> {
  if (!opts?.fetcher && !hasRobinhoodConnection()) {
    return { connected: false, fetched: 0, ingested: 0 };
  }

  let trades: LiveTrade[];
  try {
    trades = await getRobinhoodLiveTrades({ fetcher: opts?.fetcher });
  } catch {
    return { connected: true, fetched: 0, ingested: 0 }; // read failed — soft
  }

  const root = dataRoot(opts);
  const synced = await readSyncedIds(root);
  let ingested = 0;
  for (const trade of trades) {
    if (synced.has(trade.orderId)) continue;
    const ok = await journalLiveTrade(trade, opts)
      .then(() => true)
      .catch(() => false);
    if (!ok) continue; // leave it unsynced so a later run can retry
    synced.add(trade.orderId);
    ingested += 1;
  }
  if (ingested > 0) {
    await writeSyncedIds(
      root,
      synced,
      opts?.at ?? new Date().toISOString(),
    ).catch(() => {});
  }
  return { connected: true, fetched: trades.length, ingested };
}
