import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * Persisted **live** high-water mark, in USD. The Robinhood live snapshot carries
 * no equity history (`buildLiveSnapshot` sets `equityCurve: []`), so the live
 * drawdown kill latch and the `drawdown-halt` approval rail have no peak to
 * measure against. This store is that peak: a single monotonic number updated on
 * every live refresh and read wherever live drawdown is computed.
 *
 * Read is authoritative (an absent/corrupt file → `0`, a no-op floor that
 * degrades to the snapshot-derived value — never a false halt). Update is
 * best-effort: it must never sink the live read, and a missed write simply
 * re-raises the mark on the next refresh.
 */

const HighWaterSchema = z.object({
  highWaterUsd: z.number(),
  updatedAt: z.string(),
});

function dataRoot(dataDir?: string): string {
  return (
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data")
  );
}

function highWaterFile(dataDir?: string): string {
  return path.join(dataRoot(dataDir), "control", "live-high-water.json");
}

/** Read the persisted live high-water mark, or `0` when none exists / is
 *  unreadable. A `0` floor is a no-op, so a missing mark never fabricates a
 *  drawdown. */
export async function readLiveHighWater(opts?: {
  dataDir?: string;
}): Promise<number> {
  try {
    const raw = await readFile(highWaterFile(opts?.dataDir), "utf8");
    const { highWaterUsd } = HighWaterSchema.parse(JSON.parse(raw));
    return Number.isFinite(highWaterUsd) && highWaterUsd > 0 ? highWaterUsd : 0;
  } catch {
    return 0;
  }
}

/**
 * Raise the live high-water mark to `max(prior, equity)` and persist it. Returns
 * the resulting mark. Monotonic — a lower equity never lowers it. Best-effort
 * write: a persistence error is swallowed (the returned value still reflects the
 * intended mark) so this can run on the live read path without sinking it.
 */
export async function updateLiveHighWater(
  equity: number,
  opts?: { dataDir?: string; now?: string },
): Promise<number> {
  const prior = await readLiveHighWater({ dataDir: opts?.dataDir });
  const next = Math.max(prior, Number.isFinite(equity) ? equity : 0, 0);
  if (next === prior) return prior;
  try {
    const file = highWaterFile(opts?.dataDir);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify(
        { highWaterUsd: next, updatedAt: opts?.now ?? new Date().toISOString() },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } catch {
    /* a high-water write must never break the live read path */
  }
  return next;
}
