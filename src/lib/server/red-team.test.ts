import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter";
import {
  buildProsecutorPrompt,
  parseRedTeamModel,
  parseVerdict,
  redTeamOutcome,
  runRedTeam,
  type RedTeamExec,
} from "./red-team";
import { validateDataDir } from "./validate-data";
import { recordRejection, recordTradeDecision } from "./writers";

const proposal = {
  symbol: "NVDA",
  action: "buy" as const,
  side: "long" as const,
  qty: 9,
  limitPrice: 121.5,
  stopPrice: 112.0,
  takeProfit: 145.0,
  thesis: "AI accelerator demand still outrunning supply.",
  reasoning: "Breakout retest with reward/risk over 2:1.",
};

describe("buildProsecutorPrompt", () => {
  it("frames a hostile, default-to-no prosecutor and asks for a JSON verdict", () => {
    const prompt = buildProsecutorPrompt(proposal);
    expect(prompt).toContain("NVDA");
    expect(prompt).toContain(proposal.thesis);
    expect(prompt).toMatch(/refute|prosecut/i);
    expect(prompt).toMatch(/default.*(no|reject)/i);
    expect(prompt).toMatch(/json/i);
    expect(prompt).toMatch(/verdict/i);
  });

  it("penalizes a fundamental/valuation-primary thesis and flags analyst-price targets", () => {
    const prompt = buildProsecutorPrompt(proposal);
    expect(prompt).toMatch(/technical/i);
    expect(prompt).toMatch(/out of mandate|penaliz/i);
    expect(prompt).toMatch(/fundamental|valuation/i);
    expect(prompt).toMatch(/analyst_price|analyst price/i);
  });

  it("weighs relative volume and flags a missing/none catalyst", () => {
    const prompt = buildProsecutorPrompt(proposal);
    expect(prompt).toMatch(/relative volume/i);
    expect(prompt).toMatch(/above-average/i);
    expect(prompt).toMatch(/catalyst/i);
    expect(prompt).toMatch(/why now/i);
  });

  it("renders catalyst details when present", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      relativeVolume: 1.45,
      catalyst: "Q3 beat-and-raise",
      catalystType: "earnings_momentum",
    });
    expect(prompt).toContain("1.45x avg");
    expect(prompt).toContain("Q3 beat-and-raise");
    expect(prompt).toContain("earnings_momentum");
  });

  it("briefs the catalyst's news sources so the catalyst is verifiable (catalyst-news-sources M1)", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      catalyst: "CHMP recommends EU approval of the GLP-1 drug",
      catalystType: "product_news",
      catalystSources: [
        {
          headline: "Eli Lilly wins CHMP recommendation for EU approval",
          publisher: "Benzinga",
          url: "https://example.com/lly",
          publishedAt: "2026-06-26T13:30:00Z",
        },
        {
          headline: "Morgan Stanley raises Eli Lilly price target to $1,100",
          publisher: "Benzinga",
          url: null,
          publishedAt: "2026-06-26T11:00:00Z",
        },
      ],
    });
    expect(prompt).toMatch(/Catalyst sources/i);
    expect(prompt).toContain("Eli Lilly wins CHMP recommendation for EU approval");
    expect(prompt).toContain("Benzinga");
    expect(prompt).toContain("2026-06-26");
    // The prosecutor is told the catalyst is NOT catalyst-free.
    expect(prompt).toMatch(/NOT catalyst-free/i);
  });

  it("omits the sources line when there are none", () => {
    const prompt = buildProsecutorPrompt(proposal);
    expect(prompt).not.toMatch(/Catalyst sources/i);
  });

  it("on an UNAVAILABLE catalyst state tells the prosecutor it's unverified, not absent — do NOT reject for 'no catalyst' (catalyst-state-honesty M2)", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      catalyst: null,
      catalystType: null,
      catalystState: "unavailable",
    });
    // The catalyst line reflects the failed fetch, not "none stated".
    expect(prompt).toMatch(/DATA UNAVAILABLE/);
    expect(prompt).toMatch(/UNVERIFIED, NOT (confirmed-)?absent/i);
    expect(prompt).toMatch(/do NOT (treat this as 'no catalyst'|reject)/i);
    expect(prompt).not.toContain("none stated");
  });

  it("a 'none' (searched, none found) state keeps the normal weak-catalyst framing", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      catalyst: null,
      catalystType: null,
      catalystState: "none",
    });
    expect(prompt).toContain("none stated");
    expect(prompt).not.toMatch(/DATA UNAVAILABLE/);
    expect(prompt).toMatch(/NO named catalyst.*WEAK/);
  });

  it("defaults to the TREND lens and penalizes a fundamental-primary thesis", () => {
    // No `strategy` → trend mandate (back-compat with older records).
    const prompt = buildProsecutorPrompt(proposal);
    expect(prompt).toMatch(/TREND mandate/);
    expect(prompt).toMatch(/out of mandate/i);
    expect(prompt).not.toMatch(/COUNTER-TREND IS EXPECTED/);
  });

  it("threads the sleeve identically to strategy for swing (do no harm)", () => {
    // swing-trend == bare trend; swing-value == strategy:value, byte-for-byte.
    expect(buildProsecutorPrompt({ ...proposal, sleeve: "swing-trend" })).toBe(
      buildProsecutorPrompt(proposal),
    );
    expect(buildProsecutorPrompt({ ...proposal, sleeve: "swing-value" })).toBe(
      buildProsecutorPrompt({ ...proposal, strategy: "value" }),
    );
    // The sleeve wins over a mismatched/stale top-level strategy.
    expect(
      buildProsecutorPrompt({ ...proposal, strategy: "trend", sleeve: "swing-value" }),
    ).toBe(buildProsecutorPrompt({ ...proposal, strategy: "value" }));
  });

  it("briefs the CORE-LONG lens: buy-and-hold, no stop, prosecute overpaying/fees", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      sleeve: "core-long",
      symbol: "VOO",
      stopPrice: null,
      takeProfit: null,
      targetWeightPct: 0.4,
      reviewTriggerPct: 0.25,
    });
    expect(prompt).toMatch(/LONG-TERM \/ CORE/);
    // Counter-trend & no near-term catalyst must NOT be reject reasons.
    expect(prompt).toMatch(/COUNTER-TREND & NO NEAR-TERM CATALYST ARE NORMAL/);
    expect(prompt).toMatch(/NO PROTECTIVE STOP IS BY DESIGN/i);
    // It prosecutes the core-specific failure modes.
    expect(prompt).toMatch(/OVERPAYING/);
    expect(prompt).toMatch(/OVER-CONCENTRATION/);
    expect(prompt).toMatch(/FUND QUALITY|expense ratio/i);
    expect(prompt).toMatch(/unrealistic long-term return/i);
    // The target weight + review trigger are surfaced; no stop framing.
    expect(prompt).toMatch(/target weight 40%/i);
    expect(prompt).toMatch(/review trigger −25%/i);
    // It must NOT carry the trend "out of mandate" penalty or the shared-stop rail.
    expect(prompt).not.toMatch(/out of mandate/i);
    expect(prompt).not.toMatch(/the entry needs a protective stop/i);
  });

  it("never merges the core lens with trend or value", () => {
    const prompt = buildProsecutorPrompt({ ...proposal, sleeve: "core-long" });
    expect(prompt).not.toMatch(/VALUE \/ MEAN-REVERSION MANDATE/);
    expect(prompt).not.toMatch(/TREND PRECEDENCE RULE/);
    expect(prompt).not.toMatch(/HUNT THE VALUE TRAP/);
  });

  it("briefs the POSITION-MID lens: multi-week thesis, earnings-in-window tolerated", () => {
    const prompt = buildProsecutorPrompt({ ...proposal, sleeve: "position-mid" });
    expect(prompt).toMatch(/MID-TERM \/ POSITION/);
    expect(prompt).toMatch(/MULTI-WEEK THESIS IS EXPECTED/);
    expect(prompt).toMatch(/EARNINGS EVENT INSIDE THE HOLDING WINDOW IS TOLERATED/);
    expect(prompt).toMatch(/NAMED FUNDAMENTAL THESIS MAY LEAD/);
    // It still prosecutes a broken trend / deteriorating story / loose target.
    expect(prompt).toMatch(/BROKEN multi-week trend/);
    expect(prompt).toMatch(/DETERIORATING fundamental story/);
    expect(prompt).toMatch(/IMMINENT BINARY/);
    // Mid still requires a stop (it is a risk-to-stop sleeve).
    expect(prompt).toMatch(/the entry needs a protective stop/i);
    // It is not the trend "out of mandate" valuation penalty.
    expect(prompt).not.toMatch(/out of mandate/i);
    // Never merged with the other lenses.
    expect(prompt).not.toMatch(/LONG-TERM \/ CORE MANDATE/);
    expect(prompt).not.toMatch(/HUNT THE VALUE TRAP/);
  });

  it("briefs the VALUE lens differently: counter-trend expected, hunt the value trap", () => {
    const prompt = buildProsecutorPrompt({ ...proposal, strategy: "value" });
    expect(prompt).toMatch(/VALUE \/ MEAN-REVERSION/);
    expect(prompt).toMatch(/COUNTER-TREND IS EXPECTED/);
    // Below the moving averages must NOT be framed as a reject reason here.
    expect(prompt).toMatch(/NOT by itself a reason to reject/i);
    expect(prompt).toMatch(/value trap/i);
    expect(prompt).toMatch(/FUNDAMENTALS LEAD/);
    // A fundamental target is appropriate for value (not weak).
    expect(prompt).toMatch(/FUNDAMENTAL value is APPROPRIATE/i);
    // It must NOT carry the trend mandate's "out of mandate" valuation penalty.
    expect(prompt).not.toMatch(/out of mandate/i);
  });

  it("briefs cash-flow as floor support vs. value-trap in the VALUE lens", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      strategy: "value",
      cashFlow: {
        operatingCashFlow: 2_400_000_000,
        freeCashFlow: 2_000_000_000,
        fcfTrend: "stable",
        fcfYield: 0.05,
        netDebt: 1_000_000_000,
        debtToEquity: 0.8,
        interestCoverage: 12,
      },
    });
    // The figures are surfaced for the prosecutor to weigh.
    expect(prompt).toMatch(/cash-flow quality/i);
    expect(prompt).toMatch(/FCF yield/i);
    // The floor-vs-trap weighting instruction is present.
    expect(prompt).toMatch(/floor/i);
    expect(prompt).toMatch(/value.trap/i);
  });

  it("notes unknown cash flow as a weakness in the VALUE lens", () => {
    const prompt = buildProsecutorPrompt({ ...proposal, strategy: "value" });
    expect(prompt).toMatch(/cash-flow quality/i);
    expect(prompt).toMatch(/unknown|not (provided|available)/i);
  });

  it("does NOT brief cash-flow in the TREND lens (value-lens only)", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      cashFlow: {
        operatingCashFlow: 1,
        freeCashFlow: 1,
        fcfTrend: "growing",
        fcfYield: 0.1,
        netDebt: 0,
        debtToEquity: 0.1,
        interestCoverage: 50,
      },
    });
    expect(prompt).not.toMatch(/cash-flow quality/i);
  });

  it("recognizes a durable dividend as a real FLOOR in the VALUE lens", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      strategy: "value",
      catalyst: "Dividend floor: FCF covers 2.4×, 14-yr growth streak",
      catalystType: "other",
      dividend: {
        dividendYield: 0.031,
        payoutRatio: 0.45,
        fcfPayout: 1 / 2.4,
        fcfCoverage: 2.4,
        growthStreakYears: 14,
        dividendCagr: 0.11,
      },
    });
    expect(prompt).toMatch(/Dividend sustainability \(pass/i);
    expect(prompt).toMatch(/FCF covers 2\.4x/i);
    // The instruction that a real floor satisfies the why-now/floor requirement…
    expect(prompt).toMatch(/SATISFIES the why-now\/floor requirement/i);
    // …but does NOT auto-approve (the discipline guardrail).
    expect(prompt).toMatch(/NOT automatically a why-now price catalyst/i);
  });

  it("frames an uncovered dividend as a value-trap flag, not a floor", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      strategy: "value",
      dividend: {
        dividendYield: 0.07,
        payoutRatio: null,
        fcfPayout: null,
        fcfCoverage: 0.6,
        growthStreakYears: null,
        dividendCagr: null,
      },
    });
    expect(prompt).toMatch(/Dividend sustainability \(flag/i);
    expect(prompt).toMatch(/value.trap flag, NOT a floor/i);
  });

  it("does NOT brief dividend in the TREND lens (value-lens only)", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      dividend: {
        dividendYield: 0.03,
        payoutRatio: 0.4,
        fcfPayout: 0.4,
        fcfCoverage: 2.5,
        growthStreakYears: 10,
        dividendCagr: 0.08,
      },
    });
    expect(prompt).not.toMatch(/Dividend sustainability/i);
  });

  it("suppresses generic leverage/coverage/net-debt for a Finance-sector VALUE name (Issue 1)", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      strategy: "value",
      sector: "Finance",
      cashFlow: {
        operatingCashFlow: null,
        freeCashFlow: 500_000_000,
        fcfTrend: "stable",
        fcfYield: 0.04,
        netDebt: 18_630_000_000,
        debtToEquity: 3.1,
        interestCoverage: 0.3,
      },
    });
    // The misapplied leverage/coverage figures are NOT surfaced for a bank.
    expect(prompt).not.toContain("D/E 3.1");
    expect(prompt).not.toMatch(/interest coverage 0\.3/i);
    expect(prompt).not.toMatch(/net debt \$18/i);
    // The prosecutor is explicitly told not to cite them.
    expect(prompt).toMatch(/financial-sector/i);
    expect(prompt).toMatch(/do NOT cite (D\/E|debt|net debt|interest coverage)/i);
  });

  it("still surfaces D/E + interest coverage for a NON-financial VALUE name", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      strategy: "value",
      sector: "Industrials",
      cashFlow: {
        operatingCashFlow: null,
        freeCashFlow: 500_000_000,
        fcfTrend: "stable",
        fcfYield: 0.04,
        netDebt: 1_000_000_000,
        debtToEquity: 1.2,
        interestCoverage: 8,
      },
    });
    expect(prompt).toContain("D/E 1.2");
    expect(prompt).toMatch(/interest coverage 8/i);
    expect(prompt).not.toMatch(/financial-sector/i);
  });

  it("trend: a volume-confirmed setup makes catalyst timing non-fatal (Issue 2)", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      strategy: "trend",
      relativeVolume: 2.6,
      catalyst: "Earnings Oct 23",
      catalystType: "earnings_momentum",
    });
    // Volume-confirmed → why-now is satisfied; far-dated catalyst can't force a reject.
    expect(prompt).toMatch(/volume-confirmed/i);
    expect(prompt).toMatch(/satisfies the (\\"|")?why now/i);
    expect(prompt).toMatch(/NOT (by itself )?(sufficient )?grounds to (reject|REJECT)/i);
    expect(prompt).toMatch(/1\.3/); // the explicit, documented threshold
  });

  it("trend: an UNCONFIRMED-volume setup keeps the weak-catalyst framing", () => {
    const prompt = buildProsecutorPrompt({
      ...proposal,
      strategy: "trend",
      relativeVolume: 0.98,
      catalyst: null,
      catalystType: null,
      catalystState: "none",
    });
    expect(prompt).toMatch(/NO named catalyst.*WEAK/);
    expect(prompt).not.toMatch(/volume-confirmed/i);
  });

  it("keeps the shared hard rails in BOTH lenses", () => {
    for (const strategy of ["trend", "value"] as const) {
      const prompt = buildProsecutorPrompt({ ...proposal, strategy });
      expect(prompt).toMatch(/SHARED HARD RAILS/);
      expect(prompt).toMatch(/reward\/risk ≥ 2:1/i);
      expect(prompt).toMatch(/protective stop/i);
    }
  });
});

describe("parseVerdict", () => {
  it("parses a bare JSON object (back-compat: empty factors, null basis)", () => {
    const v = parseVerdict('{"verdict":"reject","notes":"Valuation too rich."}');
    expect(v).toEqual({
      verdict: "reject",
      notes: "Valuation too rich.",
      factors: [],
      basis: null,
      // `model` defaults to null at parse; runRedTeam stamps it after.
      model: null,
    });
  });

  it("parses structured factors + a basis line", () => {
    const raw = JSON.stringify({
      verdict: "concern",
      notes: "Stop is too wide for the catalyst.",
      factors: [
        { label: "Entry", assessment: "Chasing an extended breakout.", stance: "refutes" },
        { label: "Edge", assessment: "Revisions still positive.", stance: "supports" },
        { label: "Stop", assessment: "2x ATR is loose.", stance: "neutral" },
      ],
      basis: "Trade only at half size.",
    });
    const v = parseVerdict(raw);
    expect(v.verdict).toBe("concern");
    expect(v.basis).toBe("Trade only at half size.");
    expect(v.factors).toHaveLength(3);
    expect(v.factors[0]).toEqual({
      label: "Entry",
      assessment: "Chasing an extended breakout.",
      stance: "refutes",
    });
    expect(v.factors[1].stance).toBe("supports");
  });

  it("drops malformed factors and defaults an unknown stance to neutral", () => {
    const raw = JSON.stringify({
      verdict: "approve",
      notes: "Holds up.",
      factors: [
        { label: "Entry", assessment: "Clean retest." }, // no stance → neutral
        { label: "", assessment: "missing label" }, // dropped
        { label: "Stop", assessment: "" }, // dropped
        { label: "Edge", assessment: "Strong RS.", stance: "bogus" }, // → neutral
      ],
    });
    const v = parseVerdict(raw);
    expect(v.factors).toHaveLength(2);
    expect(v.factors[0].stance).toBe("neutral");
    expect(v.factors[1]).toEqual({
      label: "Edge",
      assessment: "Strong RS.",
      stance: "neutral",
    });
    expect(v.basis).toBeNull();
  });

  it("extracts JSON from a markdown code fence", () => {
    const raw = "```json\n{\"verdict\":\"approve\",\"notes\":\"Holds up.\"}\n```";
    expect(parseVerdict(raw).verdict).toBe("approve");
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const raw =
      'My analysis follows.\n{"verdict":"concern","notes":"Event risk."}\nThat is all.';
    expect(parseVerdict(raw).verdict).toBe("concern");
  });

  it("normalizes a plain-language no/yes to reject/approve", () => {
    expect(parseVerdict('{"verdict":"no","notes":"x"}').verdict).toBe("reject");
    expect(parseVerdict('{"verdict":"YES","notes":"x"}').verdict).toBe(
      "approve",
    );
  });

  it("throws when there is no parseable verdict", () => {
    expect(() => parseVerdict("I cannot decide.")).toThrow();
  });
});

describe("redTeamOutcome", () => {
  it("maps verdicts to gate outcomes", () => {
    const base = { factors: [], basis: null, model: null };
    expect(redTeamOutcome({ verdict: "reject", notes: "x", ...base })).toBe("block");
    expect(redTeamOutcome({ verdict: "concern", notes: "x", ...base })).toBe("downsize");
    expect(redTeamOutcome({ verdict: "approve", notes: "x", ...base })).toBe("allow");
  });
});

describe("runRedTeam", () => {
  it("returns the prosecutor's verdict, stamped with the model (default GPT)", async () => {
    const exec: RedTeamExec = async () =>
      '{"verdict":"reject","notes":"Thesis leans on consensus."}';
    const v = await runRedTeam(proposal, { exec });
    expect(v).toEqual({
      verdict: "reject",
      notes: "Thesis leans on consensus.",
      factors: [],
      basis: null,
      model: "codex",
    });
  });

  it("stamps the chosen model onto the verdict (red-team-model-toggle)", async () => {
    const exec: RedTeamExec = async () =>
      '{"verdict":"approve","notes":"Holds up."}';
    const v = await runRedTeam(proposal, { exec, model: "claude" });
    expect(v.verdict).toBe("approve");
    expect(v.model).toBe("claude");
  });

  it("fails CLOSED to a reject when the prosecutor errors, keeping the model", async () => {
    const exec: RedTeamExec = async () => {
      throw new Error("claude not found");
    };
    const v = await runRedTeam(proposal, { exec, model: "claude" });
    expect(v.verdict).toBe("reject");
    expect(v.notes).toMatch(/default/i);
    // The fail-closed path still records which judge was attempted.
    expect(v.model).toBe("claude");
  });

  it("fails CLOSED to a reject on unparseable output", async () => {
    const exec: RedTeamExec = async () => "no idea";
    expect((await runRedTeam(proposal, { exec })).verdict).toBe("reject");
  });
});

describe("parseRedTeamModel", () => {
  it("accepts 'claude' and defaults everything else to GPT (codex)", () => {
    expect(parseRedTeamModel("claude")).toBe("claude");
    expect(parseRedTeamModel("codex")).toBe("codex");
    expect(parseRedTeamModel("gpt")).toBe("codex");
    expect(parseRedTeamModel(undefined)).toBe("codex");
    expect(parseRedTeamModel(null)).toBe("codex");
    expect(parseRedTeamModel(42)).toBe("codex");
  });
});

describe("integration: gate → journal", () => {
  it("journals a blocked trade as a rejection with the prosecutor's reasoning", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pta-redteam-"));
    const exec: RedTeamExec = async () =>
      '{"verdict":"reject","notes":"Crowded long; stop too wide for the catalyst."}';
    const verdict = await runRedTeam(proposal, { exec });
    expect(redTeamOutcome(verdict)).toBe("block");

    const { file } = await recordRejection(
      {
        timestamp: "2026-06-24T09:36:00-04:00",
        symbol: proposal.symbol,
        proposedAction: "buy",
        rejectedBy: "codex-redteam",
        reviewDate: "2026-07-24",
        thesis: proposal.thesis,
        redTeam: verdict.notes,
        reason: verdict.notes,
      },
      { dataDir: dir },
    );

    expect(await validateDataDir(dir)).toEqual([]);
    const { data, body } = parseFrontmatter(await readFile(file, "utf8"));
    expect(data).toMatchObject({
      kind: "rejection",
      rejectedBy: "codex-redteam",
    });
    expect(body).toContain("Crowded long");
  });

  it("records the verdict on an approved trade's journal entry", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "pta-redteam-"));
    const exec: RedTeamExec = async () =>
      '{"verdict":"approve","notes":"Trend and revisions support the entry."}';
    const verdict = await runRedTeam(proposal, { exec });
    expect(redTeamOutcome(verdict)).toBe("allow");

    const { file } = await recordTradeDecision(
      {
        timestamp: "2026-06-24T09:41:00-04:00",
        symbol: proposal.symbol,
        action: "buy",
        qty: proposal.qty,
        price: proposal.limitPrice,
        stopPrice: proposal.stopPrice,
        takeProfit: proposal.takeProfit,
        reviewDate: "2026-07-24",
        thesis: proposal.thesis,
        redTeam: verdict.notes,
        decision: "Placed the paper order.",
      },
      { dataDir: dir },
    );

    const { body } = parseFrontmatter(await readFile(file, "utf8"));
    expect(body).toContain("**Red-team.** Trend and revisions support the entry.");
  });
});
