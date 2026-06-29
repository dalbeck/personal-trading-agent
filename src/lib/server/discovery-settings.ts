import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DISCOVERY_LIMITS } from "@strategy/charter.config";
import { DiscoverySettingsSchema } from "@/lib/schemas";
import type { ConvictionTier } from "@/lib/conviction";
import type { DiscoverySettings } from "@/lib/types";

/**
 * The human's tuning of the discovery **review funnel** (M3) — how many ranked
 * candidates a run surfaces, the per-sector cap + spread, and the minimum
 * conviction tier the queue shows by default. These are **preferences, not
 * safety rails**: they only shape the review queue, are explicitly **separate
 * from the hard risk rails and the 6-order/day cap**, and are bounded by the
 * charter `DISCOVERY_LIMITS` ceilings (the overlay clamps every value, so the
 * funnel can never be widened past its bound). The default (no file) is the
 * charter funnel unchanged.
 *
 * An internal state file like risk-settings / the halt latch — read
 * best-effort, NOT a `data/` artifact contract.
 */

export interface EffectiveDiscoveryLimits {
  ideaCap: number;
  maxProposalsPerSector: number;
  minSectorsTarget: number;
  minConvictionTier: ConvictionTier;
  /** Whether the value / mean-reversion sleeve is opted in for discovery (M1). */
  valueSleeveEnabled: boolean;
  /** Whether the long-term / core sleeve is opted in for discovery (core-long M3). */
  coreLongSleeveEnabled: boolean;
}

function settingsFile(dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "control", "discovery-settings.json");
}

/** The charter-default settings (no overrides), with optional overrides merged
 *  and validated — handy for tests and the "reset to defaults" action. */
export function defaultDiscoverySettings(
  overrides?: Partial<DiscoverySettings>,
): DiscoverySettings {
  return DiscoverySettingsSchema.parse({ ...(overrides ?? {}) });
}

/** Read the human's discovery settings, or the charter defaults when
 *  absent/unreadable. */
export async function readDiscoverySettings(opts?: {
  dataDir?: string;
}): Promise<DiscoverySettings> {
  try {
    const raw = await readFile(settingsFile(opts?.dataDir), "utf8");
    return DiscoverySettingsSchema.parse(JSON.parse(raw));
  } catch {
    return defaultDiscoverySettings();
  }
}

/** Validate + persist the discovery settings. Returns the normalized value. */
export async function writeDiscoverySettings(
  input: unknown,
  opts?: { dataDir?: string; now?: () => Date },
): Promise<DiscoverySettings> {
  const now = opts?.now?.() ?? new Date();
  const parsed = DiscoverySettingsSchema.parse({
    ...(input as object),
    updatedAt: now.toISOString(),
  });
  const file = settingsFile(opts?.dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

/**
 * Pure overlay: the **effective** funnel limits a discovery run uses. Each
 * tuned number overrides the charter `DISCOVERY_LIMITS` default and is **clamped
 * to the charter ceiling** — the idea cap to `[1, maxIdeaCap]`, the per-sector
 * cap to `≥ 1`, the spread target to `≥ 0` — so the human can dial the funnel up
 * or down within bounds but never past them. The hard risk rails and the
 * 6-order/day cap are not here and are unaffected.
 */
export function effectiveDiscoveryLimits(
  settings: DiscoverySettings,
): EffectiveDiscoveryLimits {
  const ideaCap = clamp(
    settings.ideaCap ?? DISCOVERY_LIMITS.ideaCap,
    1,
    DISCOVERY_LIMITS.maxIdeaCap,
  );
  const maxProposalsPerSector = Math.max(
    1,
    settings.maxProposalsPerSector ?? DISCOVERY_LIMITS.maxProposalsPerSector,
  );
  const minSectorsTarget = Math.max(
    0,
    settings.minSectorsTarget ?? DISCOVERY_LIMITS.minSectorsTarget,
  );
  return {
    ideaCap,
    maxProposalsPerSector,
    minSectorsTarget,
    minConvictionTier: settings.minConvictionTier,
    valueSleeveEnabled: settings.valueSleeveEnabled,
    coreLongSleeveEnabled: settings.coreLongSleeveEnabled,
  };
}

/** Read the settings and produce the effective funnel limits. */
export async function getEffectiveDiscoveryLimits(opts?: {
  dataDir?: string;
}): Promise<EffectiveDiscoveryLimits> {
  return effectiveDiscoveryLimits(await readDiscoverySettings(opts));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
