import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ResearchUsageSchema } from "@/lib/schemas";

/**
 * Per-day metered-API call counter persisted to `data/research/usage-<date>.json`.
 * This is what enforces the Perplexity daily cap **in code**, across calls and
 * across routine runs within a day.
 *
 * Provider-scoped via `key` (fmp-primary-for-fundamentals M2): each provider
 * gets its OWN per-day counter file (`usage-<key>-<date>.json`) so the **free**
 * FMP provider — now a primary, always-consulted source — never spends down the
 * **metered** Perplexity hard cap. Perplexity keeps the un-keyed default file;
 * FMP passes `key: "fmp"`.
 */

function usageFile(date: string, dataDir?: string, key?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  const name = key ? `usage-${key}-${date}.json` : `usage-${date}.json`;
  return path.join(root, "research", name);
}

async function readUsage(
  date: string,
  dataDir?: string,
  key?: string,
): Promise<{ count: number; costUsd?: number }> {
  try {
    const raw = await readFile(usageFile(date, dataDir, key), "utf8");
    const parsed = ResearchUsageSchema.parse(JSON.parse(raw));
    return { count: parsed.count, costUsd: parsed.costUsd };
  } catch {
    return { count: 0 }; // no file yet → no calls today
  }
}

export async function getResearchCallCount(
  date: string,
  opts?: { dataDir?: string; key?: string },
): Promise<number> {
  return (await readUsage(date, opts?.dataDir, opts?.key)).count;
}

/**
 * Increment + persist today's counter; returns the new count. Optionally
 * accumulates the real per-call `cost` (USD) for cost visibility — the
 * count-based daily cap remains the hard guardrail. `key` scopes the counter
 * to a single provider (see the module note).
 */
export async function bumpResearchCallCount(
  date: string,
  opts?: { dataDir?: string; cost?: number; key?: string },
): Promise<number> {
  const file = usageFile(date, opts?.dataDir, opts?.key);
  const prev = await readUsage(date, opts?.dataDir, opts?.key);
  const count = prev.count + 1;
  const cost = opts?.cost;
  const costUsd =
    cost != null || prev.costUsd != null
      ? (prev.costUsd ?? 0) + (cost ?? 0)
      : undefined;
  const record = ResearchUsageSchema.parse({ date, count, costUsd });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return count;
}
