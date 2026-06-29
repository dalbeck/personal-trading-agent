import { describe, expect, it } from "vitest";
import { RISK_LIMITS } from "@strategy/charter.config";
import {
  SLEEVE_CONFIGS,
  SLEEVE_CONFIG_LIST,
  enabledSleeves,
  sleeveConfig,
} from "@strategy/sleeves.config";

/**
 * Tripwire for the sleeve registry (sleeve-framework M1). Guards the "do no harm"
 * promise: the two swing sleeves route to the **untouched** `charter.md` and the
 * **unchanged** swing rails, and the new sleeves stay declared-but-disabled until
 * their milestones light them up.
 */
describe("sleeve registry — swing sleeves are unchanged", () => {
  it("routes both swing sleeves to the untouched charter.md", () => {
    expect(SLEEVE_CONFIGS["swing-trend"].charterPath).toBe("charter.md");
    expect(SLEEVE_CONFIGS["swing-value"].charterPath).toBe("charter.md");
  });

  it("resolves both swing sleeves to the shared 'swing' rail block", () => {
    expect(SLEEVE_CONFIGS["swing-trend"].railsId).toBe("swing");
    expect(SLEEVE_CONFIGS["swing-value"].railsId).toBe("swing");
  });

  it("keeps the swing sleeves on today's universe, lenses, and sizing", () => {
    for (const id of ["swing-trend", "swing-value"] as const) {
      const c = SLEEVE_CONFIGS[id];
      expect(c.horizon).toBe("swing");
      expect(c.enabled).toBe(true);
      expect(c.universeId).toBe("us-equities");
      expect(c.sizingModel).toBe("risk-to-stop");
      expect(c.benchmark).toBe("SPY");
    }
    expect(SLEEVE_CONFIGS["swing-trend"].redTeamLensId).toBe("trend");
    expect(SLEEVE_CONFIGS["swing-trend"].checklistId).toBe("trend");
    expect(SLEEVE_CONFIGS["swing-value"].redTeamLensId).toBe("value");
    expect(SLEEVE_CONFIGS["swing-value"].checklistId).toBe("value");
  });

  it("does not touch the swing rail numbers (RISK_LIMITS unchanged)", () => {
    // The swing rails are the funded desk's guard — a sleeve refactor must never
    // move them. The full lockstep check lives in charter-config.test.ts; this
    // re-asserts the load-bearing few from the sleeve side.
    expect(RISK_LIMITS.perPositionRiskPct).toBe(0.02);
    expect(RISK_LIMITS.perPositionSizePct).toBe(0.2);
    expect(RISK_LIMITS.maxConcurrentPositions).toBe(5);
    expect(RISK_LIMITS.maxOrdersPerDay).toBe(6);
    expect(RISK_LIMITS.excludedSymbols).toContain("SPY");
  });
});

describe("sleeve registry — new sleeves are declared but disabled", () => {
  it("declares position-mid and core-long, both off by default", () => {
    expect(SLEEVE_CONFIGS["position-mid"].enabled).toBe(false);
    expect(SLEEVE_CONFIGS["core-long"].enabled).toBe(false);
  });

  it("only the two swing sleeves are enabled", () => {
    expect(enabledSleeves().map((s) => s.id)).toEqual([
      "swing-trend",
      "swing-value",
    ]);
  });

  it("routes the new sleeves to their own charter files under charters/", () => {
    expect(SLEEVE_CONFIGS["position-mid"].charterPath).toBe(
      "charters/position-mid.md",
    );
    expect(SLEEVE_CONFIGS["core-long"].charterPath).toBe(
      "charters/core-long.md",
    );
  });

  it("gives core-long the ETF/index universe, target-weight sizing, and its own lens", () => {
    const c = SLEEVE_CONFIGS["core-long"];
    expect(c.horizon).toBe("long");
    expect(c.universeId).toBe("us-equities-plus-funds");
    expect(c.sizingModel).toBe("target-weight");
    expect(c.redTeamLensId).toBe("core-long");
  });
});

describe("sleeve registry — shape", () => {
  it("indexes every config by its own id", () => {
    for (const c of SLEEVE_CONFIG_LIST) {
      expect(sleeveConfig(c.id)).toBe(c);
      expect(c.id).toBeTruthy();
    }
  });
});
