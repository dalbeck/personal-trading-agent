import { describe, expect, it } from "vitest";
import { TradeProposalSchema } from "@/lib/schemas";
import {
  SLEEVES,
  SLEEVE_HORIZON,
  SLEEVE_LABEL,
  horizonOf,
  sleeveOf,
  sleeveToStrategy,
  strategyToSleeve,
} from "@/lib/sleeves";

function makeProposal(overrides: Record<string, unknown> = {}) {
  return TradeProposalSchema.parse({
    id: "p-1",
    createdAt: "2026-06-28T13:30:00-04:00",
    symbol: "KR",
    action: "buy",
    qty: 10,
    limitPrice: 50,
    riskPct: 0.015,
    thesis: "t",
    reasoning: "r",
    ...overrides,
  });
}

describe("TradeProposalSchema.sleeve back-compat", () => {
  it("defaults the sleeve to null and derives swing-trend (no strategy)", () => {
    const p = makeProposal();
    expect(p.sleeve).toBeNull();
    expect(sleeveOf(p)).toBe("swing-trend");
  });

  it("derives swing-value for a legacy strategy:value record with no sleeve", () => {
    const p = makeProposal({ strategy: "value" });
    expect(p.sleeve).toBeNull();
    expect(sleeveOf(p)).toBe("swing-value");
  });

  it("round-trips an explicit sleeve", () => {
    const p = makeProposal({ sleeve: "core-long" });
    expect(p.sleeve).toBe("core-long");
    expect(sleeveOf(p)).toBe("core-long");
  });
});

describe("sleeve <-> strategy back-compat mapping", () => {
  it("maps the two strategies to the two swing sleeves", () => {
    expect(strategyToSleeve("trend")).toBe("swing-trend");
    expect(strategyToSleeve("value")).toBe("swing-value");
  });

  it("maps a null/undefined strategy to swing-trend (the default)", () => {
    expect(strategyToSleeve(null)).toBe("swing-trend");
    expect(strategyToSleeve(undefined)).toBe("swing-trend");
  });

  it("round-trips the swing sleeves back to their strategy", () => {
    expect(sleeveToStrategy("swing-trend")).toBe("trend");
    expect(sleeveToStrategy("swing-value")).toBe("value");
  });

  it("maps the new sleeves to a trend/value-like lens for shared machinery", () => {
    // position-mid leads on trend + fundamentals; core-long on allocation/quality.
    expect(sleeveToStrategy("position-mid")).toBe("trend");
    expect(sleeveToStrategy("core-long")).toBe("value");
  });
});

describe("sleeveOf — the canonical read for a proposal's sleeve", () => {
  it("returns an explicit sleeve when present", () => {
    expect(sleeveOf({ sleeve: "core-long", strategy: "trend" })).toBe(
      "core-long",
    );
  });

  it("derives the sleeve from strategy when the field is null (legacy record)", () => {
    expect(sleeveOf({ sleeve: null, strategy: "value" })).toBe("swing-value");
    expect(sleeveOf({ sleeve: null, strategy: "trend" })).toBe("swing-trend");
  });

  it("reads a record with neither field as swing-trend", () => {
    expect(sleeveOf({})).toBe("swing-trend");
  });
});

describe("horizon derivation", () => {
  it("derives the horizon from each sleeve", () => {
    expect(horizonOf("swing-trend")).toBe("swing");
    expect(horizonOf("swing-value")).toBe("swing");
    expect(horizonOf("position-mid")).toBe("mid");
    expect(horizonOf("core-long")).toBe("long");
  });

  it("keeps SLEEVE_HORIZON consistent with horizonOf", () => {
    for (const s of SLEEVES) {
      expect(SLEEVE_HORIZON[s]).toBe(horizonOf(s));
    }
  });
});

describe("display metadata", () => {
  it("labels the swing sleeves byte-identically to the old strategy badge", () => {
    expect(SLEEVE_LABEL["swing-trend"]).toBe("Trend");
    expect(SLEEVE_LABEL["swing-value"]).toBe("Value");
  });

  it("covers every sleeve in the display list and label map", () => {
    expect(SLEEVES).toEqual([
      "swing-trend",
      "swing-value",
      "position-mid",
      "core-long",
    ]);
    for (const s of SLEEVES) {
      expect(SLEEVE_LABEL[s]).toBeTruthy();
    }
  });
});
