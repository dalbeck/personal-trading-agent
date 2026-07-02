import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "./atomic-write";
import { withRetryingLock } from "./lockfile";

/**
 * Persisted **per-ET-day order counter** — the source of truth for
 * `RiskContext.ordersToday`, so the charter's daily-order cap (≤6/day) fires
 * across *every* path that actually places an order (the paper batch and each
 * human approval) and across multiple runs within the same ET day. It is
 * incremented at **placement**, never at proposal time.
 *
 * Counting by **ET calendar day** (not UTC) matches the trading day: the count
 * resets at the New York midnight, so an order placed at 23:00 ET and one at
 * 09:00 ET the next morning are different days even though they may share a UTC
 * date. The basis date is computed from an injectable `now` for deterministic
 * tests.
 *
 * An internal state file like the halt latch / funding tracker — read
 * best-effort, written directly, NOT a `data/` artifact contract.
 */

const NY_TZ = "America/New_York";

const OrderCounterSchema = z.object({
  /** ET calendar date the count belongs to, "YYYY-MM-DD". */
  date: z.string(),
  count: z.number().int().nonnegative(),
});
type OrderCounter = z.infer<typeof OrderCounterSchema>;

function counterFile(dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "control", "order-counter.json");
}

/** ET calendar date ("YYYY-MM-DD") for `now` (defaults to the live clock). */
export function etDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: NY_TZ }).format(now);
}

/** Read the persisted counter, or `null` when absent/unreadable (treated as 0). */
async function readCounter(dataDir?: string): Promise<OrderCounter | null> {
  try {
    const raw = await readFile(counterFile(dataDir), "utf8");
    return OrderCounterSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Orders already placed **today** (ET). Returns the persisted count when it
 * belongs to the current ET day, else 0 — so the count resets automatically at
 * the New York day boundary without a separate cleanup step.
 */
export async function readOrdersToday(opts?: {
  dataDir?: string;
  now?: Date;
}): Promise<number> {
  const today = etDay(opts?.now);
  const counter = await readCounter(opts?.dataDir);
  return counter && counter.date === today ? counter.count : 0;
}

/**
 * Record one placement: increment today's ET count and persist it (resetting to
 * 1 when the stored count is from an earlier ET day). Returns the new count.
 * Call this exactly once per order that actually reached a broker/sink.
 */
export async function incrementOrdersToday(opts?: {
  dataDir?: string;
  now?: Date;
}): Promise<number> {
  const root =
    opts?.dataDir ??
    process.env.TRADING_DATA_DIR ??
    path.join(process.cwd(), "data");
  // The read-modify-write is shared across the Next server AND the routine
  // process — serialize it under one lock (H8) so two concurrent placements
  // can't both read N and write N+1 (which would let the ≤6/day cap admit a 7th).
  const run = async (): Promise<number> => {
    const today = etDay(opts?.now);
    const counter = await readCounter(opts?.dataDir);
    const count = counter && counter.date === today ? counter.count + 1 : 1;
    await atomicWrite(
      counterFile(opts?.dataDir),
      `${JSON.stringify({ date: today, count } satisfies OrderCounter, null, 2)}\n`,
    );
    return count;
  };
  const locked = await withRetryingLock("order-counter", run, {
    dir: path.join(root, "locks"),
  });
  // Lock exhausted (very rare) → fall back to the unlocked RMW so a placement is
  // still counted rather than silently dropped.
  return locked ?? run();
}
