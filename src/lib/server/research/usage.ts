import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ResearchUsageSchema } from "@/lib/schemas";

/**
 * Per-day metered-API call counter persisted to `data/research/usage-<date>.json`.
 * This is what enforces the Perplexity daily cap **in code**, across calls and
 * across routine runs within a day.
 */

function usageFile(date: string, dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "research", `usage-${date}.json`);
}

export async function getResearchCallCount(
  date: string,
  opts?: { dataDir?: string },
): Promise<number> {
  try {
    const raw = await readFile(usageFile(date, opts?.dataDir), "utf8");
    return ResearchUsageSchema.parse(JSON.parse(raw)).count;
  } catch {
    return 0; // no file yet → no calls today
  }
}

/** Increment + persist today's counter; returns the new count. */
export async function bumpResearchCallCount(
  date: string,
  opts?: { dataDir?: string },
): Promise<number> {
  const file = usageFile(date, opts?.dataDir);
  const count = (await getResearchCallCount(date, opts)) + 1;
  const record = ResearchUsageSchema.parse({ date, count });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return count;
}
