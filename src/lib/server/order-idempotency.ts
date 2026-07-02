import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { atomicWrite } from "./atomic-write";
import path from "node:path";
import { z } from "zod";

/**
 * Order idempotency (pre-live hardening M2). A double-tap on Approve, or a retry
 * after a slow broker call, must place **at most once**. Two layers guard this:
 *
 *  1. **In-process single-flight** — concurrent submits of the same client order
 *     id share ONE in-flight promise, so two near-simultaneous taps place once.
 *     The dashboard is a single localhost Node process (one instance, see
 *     `.agents/infra.md`), so an in-process registry covers concurrent taps.
 *  2. **Persisted placement record** — once an order actually places, its
 *     `{ destination, brokerOrderId, journalId }` is written under the client
 *     order id. A later retry (even after a restart) reads it back and returns
 *     the original result instead of placing again.
 *
 * The **client order id** is stable across taps of the *same* approval — it must
 * NOT include the per-request timestamp (the approval route stamps a fresh one
 * each call). It comes from the caller (the proposal id, via the approve route)
 * or is derived from the order's stable fields.
 *
 * Per-id files (hashed filename) avoid a shared-file read-modify-write race when
 * two *different* orders place at once. Internal state, written directly — NOT a
 * `data/` artifact contract; a malformed/unreadable record is treated as "not
 * placed" (so the guard fails OPEN to placing — acceptable: the in-process layer
 * still de-dups the live double-tap, and a corrupted record is rare).
 */

export interface PlacedRecord {
  clientOrderId: string;
  destination: "robinhood" | "alpaca-paper" | "mock";
  brokerOrderId: string;
  journalId: string;
  dryRun: boolean;
  placedAt: string;
}

const PlacedRecordSchema = z.object({
  clientOrderId: z.string(),
  destination: z.enum(["robinhood", "alpaca-paper", "mock"]),
  brokerOrderId: z.string(),
  journalId: z.string(),
  dryRun: z.boolean(),
  placedAt: z.string(),
});

function placedDir(dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "control", "placed-orders");
}

/** Hashed, filesystem-safe filename for an arbitrary client order id. */
function placedFile(clientOrderId: string, dataDir?: string): string {
  const name = createHash("sha1").update(clientOrderId).digest("hex");
  return path.join(placedDir(dataDir), `${name}.json`);
}

/**
 * Stable client order id for an approval. Prefers an explicit `idempotencyKey`
 * (the proposal id, supplied by the approve route); otherwise derives one from
 * the order's stable fields. **Never** includes the request timestamp, so two
 * taps of the same approval map to the same id.
 */
export function deriveClientOrderId(input: {
  idempotencyKey?: string | null;
  order: {
    account?: "paper" | "live";
    symbol: string;
    action: string;
    qty: number;
    limitPrice: number;
    reviewDate: string;
  };
}): string {
  const explicit = input.idempotencyKey?.trim();
  if (explicit) return explicit;
  const o = input.order;
  return [
    o.account ?? "paper",
    o.symbol,
    o.action,
    o.qty,
    o.limitPrice,
    o.reviewDate,
  ].join(":");
}

/** Read a prior placement for this client order id, or null when none / unreadable. */
export async function readPlacedOrder(
  clientOrderId: string,
  opts?: { dataDir?: string },
): Promise<PlacedRecord | null> {
  try {
    const raw = await readFile(placedFile(clientOrderId, opts?.dataDir), "utf8");
    return PlacedRecordSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Persist a placement so a later retry returns it instead of re-placing.
 *  Best-effort: the order already placed, so a record-write failure must not turn
 *  success into an error (it only weakens dedup for a subsequent retry). */
export async function recordPlacedOrder(
  record: PlacedRecord,
  opts?: { dataDir?: string },
): Promise<void> {
  try {
    const file = placedFile(record.clientOrderId, opts?.dataDir);
    await atomicWrite(file, `${JSON.stringify(record, null, 2)}\n`);
  } catch {
    /* see doc comment — never fail a placed order on a record-write error */
  }
}

/** In-process registry of in-flight placements, keyed by client order id. */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run `fn` at most once for `key` while it is in flight: a concurrent caller with
 * the same key awaits the SAME promise instead of starting a second placement.
 * The entry clears when the promise settles, so later (sequential) calls re-run
 * — those are guarded by the persisted record, not this registry.
 */
export function runSingleFlight<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}
