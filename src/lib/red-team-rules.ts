/**
 * Red-team ruleset — the human-readable, code-derived spec of how the hostile
 * prosecutor (`runRedTeam` / `buildProsecutorPrompt`) judges a proposed trade.
 * Rendered read-only on the Strategy page so the desk can see the rules without
 * reading the prompt code.
 *
 * Single source of truth for the NUMBERS: every threshold below is re-exported
 * from the real constants the prosecutor enforces (`MIN_REWARD_RISK`,
 * `REL_VOLUME_BREAKOUT_MIN`, `CASH_FLOW_THRESHOLDS`), so the figures shown on the
 * page can never drift from the gate. The rule PROSE mirrors the prompt's
 * mandate guidance (including red-team-fixes Issue 1 — the financial-sector
 * leverage caveat — and Issue 2 — the trend volume-confirmed why-now
 * precedence). Plain module (no `server-only`) so the client view can import it.
 */
import { CASH_FLOW_THRESHOLDS } from "@/lib/cash-flow";
import { formatPercent } from "@/lib/format";
import { MIN_REWARD_RISK } from "@/lib/risk-reward";
import { REL_VOLUME_BREAKOUT_MIN } from "@/lib/volume";

/** The thresholds the prosecutor enforces, re-exported from their source of
 *  truth so the view (and its drift-guard test) read the real numbers. */
export const RED_TEAM_RULE_THRESHOLDS = {
  minRewardRisk: MIN_REWARD_RISK,
  relVolBreakoutMin: REL_VOLUME_BREAKOUT_MIN,
  debtToEquityHeavy: CASH_FLOW_THRESHOLDS.debtToEquityHeavy,
  interestCoverageWeak: CASH_FLOW_THRESHOLDS.interestCoverageWeak,
  fcfYieldHealthy: CASH_FLOW_THRESHOLDS.fcfYieldHealthy,
} as const;

export interface RedTeamRuleSection {
  /** Stable id used for keys + the section ordering contract. Ids match the
   *  sleeve values so the rules view can't drift from the prosecutor's lenses. */
  id: "shared" | "trend" | "value" | "position-mid" | "core-long";
  title: string;
  summary: string;
  rules: string[];
}

export interface RedTeamThreshold {
  label: string;
  value: string;
  note: string;
}

export interface RedTeamRules {
  intro: string;
  sections: RedTeamRuleSection[];
  thresholds: RedTeamThreshold[];
}

const T = RED_TEAM_RULE_THRESHOLDS;

export const RED_TEAM_RULES: RedTeamRules = {
  intro:
    "After the desk's model proposes a trade, a different model family reviews it as a hostile prosecutor told to refute the thesis and default to “no.” A reject blocks the trade, a concern allows it only at reduced size, and an approve lets it through. The verdict is recorded on the proposal. These rules are read live from the prosecutor's logic — changing them means changing the code, not this page.",
  sections: [
    {
      id: "shared",
      title: "Shared hard rails",
      summary: "Applied to every trade, both mandates. A miss here is a strike.",
      rules: [
        "A protective stop is required — a missing or too-wide stop is a strike.",
        `Reward-to-risk must be at least ${T.minRewardRisk}:1; a thinner reward/risk is a strike.`,
        "Risk must be sized within the charter caps.",
      ],
    },
    {
      id: "trend",
      title: "Trend lens",
      summary:
        "Technical trend-following — structure, momentum, relative strength, volume, price.",
      rules: [
        "The thesis must be primarily technical. A fundamental / valuation-primary rationale (“cheap”, “undervalued”, “analyst upgrade”) is out of mandate and is penalized.",
        `Why-now precedence: a volume-confirmed setup — relative volume ≥ ${T.relVolBreakoutMin}× average on a trend in force — already satisfies the “why now.” A far-dated, weak, or absent named catalyst can lower conviction (toward concern) but is NOT, on its own, grounds to reject a volume-confirmed trend.`,
        `When volume does not confirm (relative volume below ${T.relVolBreakoutMin}× or unknown), the catalyst must carry the why-now; no catalyst and no volume confirmation is a weak momentum chase.`,
        "A breakout/momentum entry should come on above-average volume; a pullback/reset on declining / below-average volume.",
        "A target anchored to a sell-side analyst price — or left unspecified — is weak.",
      ],
    },
    {
      id: "value",
      title: "Value lens",
      summary:
        "Value / mean-reversion — counter-trend is expected; the job is to hunt the value trap.",
      rules: [
        "Counter-trend is expected. Being below the 50-/200-day or in a downtrend is normal here and is not by itself a reason to reject.",
        "Fundamentals lead: judge quality first — a durable, profitable business trading at a genuine discount.",
        "Hunt the value trap: deteriorating fundamentals, no real catalyst or floor, a falling knife, or an unrealistic target are rejects.",
        "Cash flow is the floor-vs-trap tell: positive, stable / growing free cash flow with a healthy yield supports a floor; negative or declining FCF is a strong value-trap flag. Unknown cash flow is unverified — a weakness, not a free pass.",
        "A durable, well-covered dividend is a real floor and satisfies the why-now — but a safe dividend alone does not force an approve.",
        "Financial-sector leverage caveat: for Finance-sector names (banks, insurers, capital markets), generic debt-to-equity, net debt, and interest coverage are category errors — high leverage is by design — and are NOT cited as value-trap signals.",
        "A target anchored to fundamental value is appropriate here (not weak); a sell-side analyst price is still weak.",
      ],
    },
    {
      id: "position-mid",
      title: "Position lens — mid-term",
      summary:
        "Weeks-to-quarters position trade that blends trend with fundamentals.",
      rules: [
        "A multi-week thesis is expected — this is not a day/week swing. The absence of an immediate momentum trigger (a fresh breakout, a same-day volume spike) is NOT by itself a reason to reject.",
        "An earnings event inside the holding window is tolerated, not an automatic disqualifier (unlike a swing) — weigh it as risk to size around, UNLESS it is an imminent binary whose downside exceeds the position's risk.",
        "A named fundamental thesis may lead — a valuation / earnings-inflection rationale is in mandate, and a target anchored to fundamental value is appropriate. A sell-side analyst price or an unspecified target is still weak.",
        "Still prosecute: a broken multi-week trend (structure actually rolled over, not a mere pullback), a deteriorating fundamental story (falling revenue/margins, cut guidance), an imminent binary that exceeds the risk, or a loose target / thin reward-to-risk.",
      ],
    },
    {
      id: "core-long",
      title: "Core lens — long-term hold",
      summary:
        "A multi-year buy-and-hold allocation, sized to a target weight and reviewed on a wide drawdown — not a swing trade.",
      rules: [
        "Counter-trend and no near-term catalyst are normal — being below the moving averages, in a drawdown, or lacking a near-term catalyst is expected for a quarters-to-years holding and is NOT by itself a reason to reject.",
        "No protective stop is by design — a core position is governed by its target weight and a wide review trigger, not a stop. Do not cite a missing stop, missing target, or thin reward-to-risk as a flaw.",
        "Prosecute overpaying versus long-term value — buying a good asset at a rich price (expensive vs its own history or a sensible long-horizon valuation) is a real objection.",
        "Prosecute thesis drift / a story stock dressed up as core, and over-concentration versus the target allocation.",
        "For an ETF or index fund, judge fund quality: a high expense ratio compounds against the holder for years, and poor tracking or a thin/exotic structure is a real objection.",
        "Prosecute an unrealistic long-term return assumption — a thesis premised on an implausible compounding rate over the horizon is weak.",
      ],
    },
  ],
  thresholds: [
    {
      label: "Reward-to-risk minimum",
      value: `${T.minRewardRisk}:1`,
      note: "Shared hard rail — below this is a strike.",
    },
    {
      label: "Volume confirmation (trend)",
      value: `≥ ${T.relVolBreakoutMin}× avg`,
      note: "Confirms a trend's why-now; below this, the catalyst must carry it.",
    },
    {
      label: "Heavy leverage (value)",
      value: `D/E > ${T.debtToEquityHeavy}`,
      note: "Value-trap weight — suppressed for financial-sector names.",
    },
    {
      label: "Thin interest coverage (value)",
      value: `< ${T.interestCoverageWeak}×`,
      note: "Value-trap weight — suppressed for financial-sector names.",
    },
    {
      label: "Healthy FCF yield (value)",
      value: `≥ ${formatPercent(T.fcfYieldHealthy, { signed: false })}`,
      note: "The yield a clean value floor clears.",
    },
  ],
};
