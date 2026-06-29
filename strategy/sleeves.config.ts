import {
  CORE_LONG_LIMITS,
  POSITION_MID_LIMITS,
  RISK_LIMITS,
} from "./charter.config";
import type { RiskLimits } from "@/lib/risk/types";
import type { Horizon, Sleeve } from "@/lib/types";

/**
 * Sleeve routing registry (sleeve-framework M1) — the machine-readable map from
 * each **sleeve** to its charter file, rail block, universe, sizing model,
 * red-team lens, checklist, benchmark, and cadence. A sibling of
 * `charter.config.ts`; the only thing all sleeves share is the safety envelope
 * (`LIVE_LIMITS` + the single `maxOrdersPerDay`), which lives in
 * `charter.config.ts` and is **cross-sleeve and unchanged**.
 *
 * **M1 is additive and does no harm.** Only the two `swing-*` sleeves are
 * `enabled`, and they resolve to **today's exact** charter (`charter.md`), rails
 * (`RISK_LIMITS`), universe, and lenses. `position-mid` and `core-long` are
 * **declared but disabled** here so the rest of the app can see the target end
 * state; their rails (M2), charters/lenses (M3/M4) land in later milestones.
 *
 * The agent never edits this file — like the charter, it is human-owned
 * constitution. Routing is data, not behavior: changing `railsId` here does not
 * by itself move a number; the enforced rail values stay in `charter.config.ts`.
 */

/** How a position in this sleeve is sized. `risk-to-stop` = size from the stop
 *  distance + ≤2% risk (today's only model); `target-weight` = size to a target
 *  portfolio weight, no stop required (M2, used by `core-long`). */
export type SizingModel = "risk-to-stop" | "target-weight";

/** Which rail block in `charter.config.ts` a sleeve resolves to. Only `swing`
 *  is wired in M1; `position-mid` / `core-long` blocks are added in M2. */
export type RailsId = "swing" | "position-mid" | "core-long";

/** Which checklist / red-team lens a sleeve is prosecuted under. `trend` / `value`
 *  are today's lenses; `position-mid` / `core-long` get their own in M4 / M3. */
export type LensId = "trend" | "value" | "position-mid" | "core-long";

/** Which universe a sleeve may hold. `us-equities` = US single names, no funds
 *  (the swing universe, SPY excluded); `us-equities-plus-funds` additionally
 *  permits ETFs/index funds (core-long only, M3). */
export type UniverseId = "us-equities" | "us-equities-plus-funds";

/** A discovery / review cadence — long-horizon sleeves do not want a daily hunt. */
export type SleeveCadence = "daily" | "weekly" | "monthly" | "quarterly";

export interface SleeveConfig {
  /** Stable sleeve id (matches the `Sleeve` enum). */
  id: Sleeve;
  /** Derived investment horizon. */
  horizon: Horizon;
  /** Whether the sleeve is live. Off by default for the new sleeves — enabled
   *  deliberately, like the value sleeve. M1: only the two swing sleeves are on. */
  enabled: boolean;
  /** One-line mandate — the entry thesis that leads for this sleeve. */
  mandate: string;
  /** Charter file routed to this sleeve, **relative to `strategy/`**. Both swing
   *  sleeves point at the untouched `charter.md`; the new sleeves point at their
   *  (created in M3/M4) files under `charters/`. */
  charterPath: string;
  /** Universe permission for this sleeve. */
  universeId: UniverseId;
  /** Sizing model. */
  sizingModel: SizingModel;
  /** Whether an entry in this sleeve **requires a protective stop** (per-sleeve-
   *  rails M2). `true` for `swing-*` and `position-mid` (a stopless entry is
   *  rejected and journaled); `false` for `core-long`, which is sized by target
   *  weight and validated by a wide drawdown/**review trigger** instead of a stop. */
  requiresStop: boolean;
  /** Rail block in `charter.config.ts`. */
  railsId: RailsId;
  /** Red-team lens this sleeve is prosecuted under (never merged with another). */
  redTeamLensId: LensId;
  /** Checklist this sleeve uses. */
  checklistId: LensId;
  /** Benchmark this sleeve is measured against. */
  benchmark: string;
  /** Discovery / review cadence. */
  cadence: SleeveCadence;
}

export const SLEEVE_CONFIGS: Record<Sleeve, SleeveConfig> = {
  "swing-trend": {
    id: "swing-trend",
    horizon: "swing",
    enabled: true,
    mandate:
      "Technical trend / momentum on US single names — breakout/pullback entries, a stop on every trade.",
    charterPath: "charter.md",
    universeId: "us-equities",
    sizingModel: "risk-to-stop",
    requiresStop: true,
    railsId: "swing",
    redTeamLensId: "trend",
    checklistId: "trend",
    benchmark: "SPY",
    cadence: "daily",
  },
  "swing-value": {
    id: "swing-value",
    horizon: "swing",
    enabled: true,
    mandate:
      "Value / mean-reversion on US single names — fundamentals lead, counter-trend expected, a stop on every trade.",
    charterPath: "charter.md",
    universeId: "us-equities",
    sizingModel: "risk-to-stop",
    requiresStop: true,
    railsId: "swing",
    redTeamLensId: "value",
    checklistId: "value",
    benchmark: "SPY",
    cadence: "daily",
  },
  "position-mid": {
    id: "position-mid",
    horizon: "mid",
    enabled: false,
    mandate:
      "Weeks–quarters position trades — trend + fundamental blend, an earnings event inside the window tolerated, a (wider) stop on every trade.",
    charterPath: "charters/position-mid.md",
    universeId: "us-equities",
    sizingModel: "risk-to-stop",
    requiresStop: true,
    railsId: "position-mid",
    redTeamLensId: "position-mid",
    checklistId: "position-mid",
    benchmark: "SPY",
    cadence: "weekly",
  },
  "core-long": {
    id: "core-long",
    horizon: "long",
    enabled: false,
    mandate:
      "Quarters–years core book — allocation / quality / valuation; ETFs and index funds permitted; sized by target weight, no protective stop (a wide drawdown/review trigger instead).",
    charterPath: "charters/core-long.md",
    universeId: "us-equities-plus-funds",
    sizingModel: "target-weight",
    requiresStop: false,
    railsId: "core-long",
    redTeamLensId: "core-long",
    checklistId: "core-long",
    benchmark: "SPY total return",
    cadence: "quarterly",
  },
};

/** Every sleeve config, in display order. */
export const SLEEVE_CONFIG_LIST: readonly SleeveConfig[] = [
  SLEEVE_CONFIGS["swing-trend"],
  SLEEVE_CONFIGS["swing-value"],
  SLEEVE_CONFIGS["position-mid"],
  SLEEVE_CONFIGS["core-long"],
];

/** Look up a sleeve's config. */
export function sleeveConfig(id: Sleeve): SleeveConfig {
  return SLEEVE_CONFIGS[id];
}

/** The enabled sleeves only — the live mandates. M1: the two swing sleeves. */
export function enabledSleeves(): readonly SleeveConfig[] {
  return SLEEVE_CONFIG_LIST.filter((s) => s.enabled);
}

/** The rail block a `railsId` resolves to (per-sleeve-rails M2). The enforced
 *  numbers live in `charter.config.ts`; this only routes. */
const RAILS_BY_ID: Record<RailsId, RiskLimits> = {
  swing: RISK_LIMITS,
  "position-mid": POSITION_MID_LIMITS,
  "core-long": CORE_LONG_LIMITS,
};

/** Resolve a sleeve's rail block (per-sleeve-rails M2). The two swing sleeves
 *  resolve to the **unchanged** `RISK_LIMITS`; the new sleeves to their own
 *  blocks. This is the base the human's risk-settings overlay layers on top of. */
export function railsForSleeve(sleeve: Sleeve): RiskLimits {
  return RAILS_BY_ID[SLEEVE_CONFIGS[sleeve].railsId];
}

/** Whether a sleeve requires a protective stop on every entry (per-sleeve-rails
 *  M2). `core-long` is the one `false` — it uses a drawdown/review trigger. */
export function sleeveRequiresStop(sleeve: Sleeve): boolean {
  return SLEEVE_CONFIGS[sleeve].requiresStop;
}
