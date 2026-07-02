import "server-only";

import { readFile } from "node:fs/promises";
import { atomicWrite } from "./atomic-write";
import path from "node:path";
import { AllocationTargetsSchema } from "@/lib/schemas";
import type { AllocationTargets } from "@/lib/types";

/**
 * The human's **target allocation across sleeves** (portfolio M5), persisted at
 * `data/control/allocation-targets.json`. The agent **reads** this to compute
 * drift and propose rebalances, but **never writes** it — it is human-owned, like
 * the rails and the charters. Empty by default (no mix set until the human defines
 * one). An internal state file like the risk/discovery settings — not a `data/`
 * artifact contract.
 */

function settingsFile(dataDir?: string): string {
  return path.join(
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data"),
    "control",
    "allocation-targets.json",
  );
}

/** The empty default — no targets set, a 5-point drift band. */
export function defaultAllocationTargets(): AllocationTargets {
  return AllocationTargetsSchema.parse({});
}

/** Read the human's allocation targets, or the empty default when absent. */
export async function readAllocationTargets(opts?: {
  dataDir?: string;
}): Promise<AllocationTargets> {
  try {
    const raw = await readFile(settingsFile(opts?.dataDir), "utf8");
    return AllocationTargetsSchema.parse(JSON.parse(raw));
  } catch {
    return defaultAllocationTargets();
  }
}

/** Validate + persist the allocation targets (the human's edit). Returns the
 *  parsed (normalized) value. The agent never calls this. */
export async function writeAllocationTargets(
  input: unknown,
  opts?: { dataDir?: string; now?: () => Date },
): Promise<AllocationTargets> {
  const now = opts?.now?.() ?? new Date();
  const parsed = AllocationTargetsSchema.parse({
    ...(input as object),
    updatedAt: now.toISOString(),
  });
  const file = settingsFile(opts?.dataDir);
  await atomicWrite(file, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}
