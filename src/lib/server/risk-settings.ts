import "server-only";

import { readFile } from "node:fs/promises";
import { atomicWrite } from "./atomic-write";
import path from "node:path";
import { RISK_LIMITS } from "@strategy/charter.config";
import type { RiskLimits } from "@/lib/risk/types";
import { RiskSettingsSchema } from "@/lib/schemas";
import type { RiskSettings } from "@/lib/types";

/**
 * The human's per-rail overrides of the charter `RISK_LIMITS`, layered in at
 * per-trade approval time. The charter constants remain the **safe defaults**;
 * this file only ever *overrides* them, and the default (no file, or all rails
 * enabled with no value) is the charter rails unchanged — so the gate stays hard
 * by default. Disabling or loosening a rail is the human's explicit, persisted,
 * logged choice (see `.agents/infra.md`). The agent can only relax a rail via
 * this human-edited file; it can never weaken the charter constants themselves.
 *
 * An internal state file like the halt latch / funding tracker — read
 * best-effort, NOT a `data/` artifact contract.
 */

function settingsFile(dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "control", "risk-settings.json");
}

/** The charter-default settings (every rail enabled, no numeric override). */
export function defaultRiskSettings(): RiskSettings {
  return RiskSettingsSchema.parse({});
}

/** Read the human's risk settings, or the charter defaults when absent/unreadable. */
export async function readRiskSettings(opts?: {
  dataDir?: string;
}): Promise<RiskSettings> {
  try {
    const raw = await readFile(settingsFile(opts?.dataDir), "utf8");
    return RiskSettingsSchema.parse(JSON.parse(raw));
  } catch {
    return defaultRiskSettings();
  }
}

/** Validate + persist the risk settings. Returns the parsed (normalized) value. */
export async function writeRiskSettings(
  input: unknown,
  opts?: { dataDir?: string; now?: () => Date },
): Promise<RiskSettings> {
  const now = opts?.now?.() ?? new Date();
  const parsed = RiskSettingsSchema.parse({
    ...(input as object),
    updatedAt: now.toISOString(),
  });
  const file = settingsFile(opts?.dataDir);
  await atomicWrite(file, `${JSON.stringify(parsed, null, 2)}\n`);
  return parsed;
}

/**
 * Pure overlay: turn the human's settings into the **effective** risk config
 * the gate evaluates — a `RiskLimits` (with any adjusted numbers) plus the set
 * of `skipRules` for disabled rails. The charter `RISK_LIMITS` is the base; an
 * enabled rail with a `value` overrides that number; a disabled rail is skipped.
 * `value` is ignored for the on/off rails (stopRequired, universe).
 */
export function effectiveRiskConfig(
  settings: RiskSettings,
  base: RiskLimits = RISK_LIMITS,
): {
  limits: RiskLimits;
  skipRules: string[];
} {
  // `base` is the sleeve's rail block (per-sleeve-rails M2). Defaults to the swing
  // RISK_LIMITS so an un-sleeved caller is unchanged; the human's overlay layers
  // on top of whichever sleeve's rails apply.
  const limits: RiskLimits = { ...base };
  const skipRules: string[] = [];

  if (!settings.positionSize.enabled) skipRules.push("position-size");
  else if (settings.positionSize.value != null)
    limits.perPositionSizePct = settings.positionSize.value;

  if (!settings.dailyOrderCap.enabled) skipRules.push("daily-order-cap");
  else if (settings.dailyOrderCap.value != null)
    limits.maxOrdersPerDay = settings.dailyOrderCap.value;

  if (!settings.drawdownHalt.enabled) skipRules.push("drawdown-halt");
  else if (settings.drawdownHalt.value != null)
    limits.drawdownHaltPct = settings.drawdownHalt.value;

  if (!settings.stopRequired.enabled) skipRules.push("stop-attached");
  if (!settings.universe.enabled) skipRules.push("universe");

  return { limits, skipRules };
}

/** Read the settings and produce the effective risk config (limits + skipRules).
 *  `base` is the sleeve's rail block (per-sleeve-rails M2); defaults to the swing
 *  RISK_LIMITS so existing callers are unchanged. */
export async function getEffectiveRiskConfig(opts?: {
  dataDir?: string;
  base?: RiskLimits;
}): Promise<{ limits: RiskLimits; skipRules: string[] }> {
  return effectiveRiskConfig(await readRiskSettings(opts), opts?.base);
}
