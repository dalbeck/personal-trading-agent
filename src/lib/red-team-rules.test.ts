import { describe, expect, it } from "vitest";
import {
  RED_TEAM_RULES,
  RED_TEAM_RULE_THRESHOLDS,
} from "@/lib/red-team-rules";
import { CASH_FLOW_THRESHOLDS } from "@/lib/cash-flow";
import { REL_VOLUME_BREAKOUT_MIN } from "@/lib/volume";
import { MIN_REWARD_RISK } from "@/lib/risk-reward";
import { SLEEVES, sleeveToStrategy } from "@/lib/sleeves";

describe("RED_TEAM_RULE_THRESHOLDS", () => {
  it("re-exports the real prosecutor constants (drift guard)", () => {
    expect(RED_TEAM_RULE_THRESHOLDS.minRewardRisk).toBe(MIN_REWARD_RISK);
    expect(RED_TEAM_RULE_THRESHOLDS.relVolBreakoutMin).toBe(
      REL_VOLUME_BREAKOUT_MIN,
    );
    expect(RED_TEAM_RULE_THRESHOLDS.debtToEquityHeavy).toBe(
      CASH_FLOW_THRESHOLDS.debtToEquityHeavy,
    );
    expect(RED_TEAM_RULE_THRESHOLDS.interestCoverageWeak).toBe(
      CASH_FLOW_THRESHOLDS.interestCoverageWeak,
    );
    expect(RED_TEAM_RULE_THRESHOLDS.fcfYieldHealthy).toBe(
      CASH_FLOW_THRESHOLDS.fcfYieldHealthy,
    );
  });
});

describe("RED_TEAM_RULES", () => {
  const ids = RED_TEAM_RULES.sections.map((s) => s.id);

  it("covers the shared rails + every lens (shared, trend, value, mid, core)", () => {
    expect(ids).toEqual([
      "shared",
      "trend",
      "value",
      "position-mid",
      "core-long",
    ]);
    for (const s of RED_TEAM_RULES.sections) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.rules.length).toBeGreaterThan(0);
    }
  });

  it("resolves every sleeve to a present rules section (drift guard)", () => {
    // "read live from the prosecutor's logic" — a sleeve added without a rules
    // section would silently vanish from the Strategy page. This fails first.
    const idSet = new Set(ids);
    for (const sleeve of SLEEVES) {
      const sectionId =
        sleeve === "position-mid" || sleeve === "core-long"
          ? sleeve
          : sleeveToStrategy(sleeve);
      expect(idSet.has(sectionId), `no rules section for sleeve ${sleeve}`).toBe(
        true,
      );
    }
  });

  it("has a non-empty intro and a thresholds grid", () => {
    expect(RED_TEAM_RULES.intro.length).toBeGreaterThan(0);
    expect(RED_TEAM_RULES.thresholds.length).toBeGreaterThan(0);
  });

  function section(id: string) {
    const s = RED_TEAM_RULES.sections.find((x) => x.id === id);
    if (!s) throw new Error(`missing section ${id}`);
    return s.rules.join("\n");
  }

  it("shared rails cite the reward-to-risk minimum", () => {
    expect(section("shared")).toContain(`${MIN_REWARD_RISK}:1`);
  });

  it("trend lens encodes the volume-confirmed why-now precedence (Issue 2)", () => {
    const trend = section("trend");
    expect(trend).toMatch(/volume-confirmed/i);
    expect(trend).toContain(`${REL_VOLUME_BREAKOUT_MIN}`);
    // A far-dated/absent catalyst must NOT, on its own, force a reject.
    expect(trend).toMatch(/\bnot\b[^\n]*\breject\b/i);
  });

  it("value lens encodes the financial-sector leverage caveat (Issue 1)", () => {
    const value = section("value");
    expect(value).toMatch(/financial-sector/i);
    expect(value).toMatch(/debt-to-equity|D\/E|interest coverage/i);
    expect(value).toMatch(/not .*(value-trap|cite)/i);
  });

  it("thresholds grid surfaces the leverage + volume numbers", () => {
    const blob = RED_TEAM_RULES.thresholds
      .map((t) => `${t.label} ${t.value} ${t.note}`)
      .join("\n");
    expect(blob).toContain(`${REL_VOLUME_BREAKOUT_MIN}`);
    expect(blob).toContain(`${CASH_FLOW_THRESHOLDS.debtToEquityHeavy}`);
  });
});
