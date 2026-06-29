import "server-only";

import { spawn } from "node:child_process";
import { RedTeamVerdictSchema } from "@/lib/schemas";
import {
  assessCashFlowQuality,
  hasCashFlowData,
  isFinancialSector,
} from "@/lib/cash-flow";
import { REL_VOLUME_BREAKOUT_MIN } from "@/lib/volume";
import { MIN_REWARD_RISK } from "@/lib/risk-reward";
import {
  assessDividendFloor,
  dividendCoverage,
  hasDividendData,
} from "@/lib/dividend";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import { researchUnavailableLabel } from "@/lib/research-availability";
import { sleeveToStrategy, type Sleeve } from "@/lib/sleeves";
import type {
  CashFlowQuality,
  CatalystSource,
  CatalystState,
  DividendSignals,
  RedTeamVerdict,
  ResearchStatus,
} from "@/lib/types";

/**
 * Red-team gate. After the primary model proposes a trade, a **different model
 * family** (`codex exec`) is invoked as a hostile prosecutor told to refute the
 * thesis and **default to "no."** The value is adversarial pressure, not a
 * second opinion. The verdict is recorded; a "reject" blocks the trade.
 *
 * The `codex` spawn is injected (`opts.exec`) so the prompt/parse/policy logic
 * is unit-tested without the CLI. If the prosecutor is unavailable or its output
 * can't be parsed, the gate **fails closed** to a reject — never silently allow.
 */

export interface RedTeamProposal {
  symbol: string;
  action: "buy" | "sell";
  side: "long" | "short";
  /** Which mandate to brief the prosecutor under (value-sleeve M1). `trend`
   *  (default) → the technical trend-following lens (counter-trend is a strike);
   *  `value` → the value / mean-reversion lens (counter-trend is EXPECTED, the
   *  prosecutor hunts value-trap signals instead). The two lenses are never
   *  merged — each proposal is judged under the one it carries. */
  strategy?: "trend" | "value";
  /** The sleeve to brief the prosecutor under (sleeve-framework M1). When set it
   *  takes precedence over `strategy` to pick the lens; the two swing sleeves
   *  resolve to the same trend/value lens as `strategy`, so the swing prosecutor
   *  briefing is byte-identical. Optional so existing callers are untouched. */
  sleeve?: Sleeve | null;
  qty: number;
  limitPrice: number;
  stopPrice: number | null;
  takeProfit: number | null;
  /** Core-long (target-weight) sizing (core-long M3) — the prosecutor sees the
   *  target weight + review trigger in place of a stop, and is told the missing
   *  stop is by design. Null/absent for swing/mid. */
  targetWeightPct?: number | null;
  reviewTriggerPct?: number | null;
  /** How the target is anchored (M3). An `analyst_price` or unspecified target is
   *  weak — the prosecutor is told to flag it. */
  targetType?: string | null;
  /** Relative volume = entry-day volume ÷ trailing average (M2). A soft volume
   *  confirmation the prosecutor weighs; null/absent when unknown. */
  relativeVolume?: number | null;
  /** The named catalyst — why *now* (M3). A `none`/trend-alone or missing
   *  catalyst is weak; the prosecutor is told to flag it. */
  catalyst?: string | null;
  catalystType?: string | null;
  /** GICS sector (e.g. "Finance"/"Financials"). For Finance-sector names the
   *  prosecutor suppresses the generic leverage/coverage/net-debt value-trap
   *  factors — they are category errors for deposit-funded businesses
   *  (red-team-fixes Issue 1). Null/absent when unknown. */
  sector?: string | null;
  /** The headlines that informed the catalyst (catalyst-news-sources M1) — the
   *  prosecutor sees the catalyst is backed by real, datable news (so it can't
   *  reject a catalyst-rich name as "catalyst-free" on a clean fetch). */
  catalystSources?: CatalystSource[] | null;
  /** The catalyst capture state (catalyst-state-honesty M2). On `unavailable`
   *  (the fetch FAILED) the prosecutor is told the catalyst is UNVERIFIED, not
   *  absent, and must NOT reject for "no catalyst" — flag it for retry instead. */
  catalystState?: CatalystState | null;
  /** Cash-flow quality for the VALUE mandate (value-cashflow M1) — the prosecutor
   *  weighs durable/positive FCF as floor support and negative/declining FCF +
   *  rising leverage as a value-trap red flag. Value lens only; null/absent for
   *  trend (the trend prompt never mentions it). */
  cashFlow?: CashFlowQuality | null;
  /** Dividend-sustainability signals for the VALUE mandate (dividend-floor M1) —
   *  the prosecutor recognizes a durable, well-covered dividend as a real FLOOR
   *  (and stops rejecting purely for "no floor"), but an uncovered / at-risk one
   *  as a value-trap flag. Value lens only; null/absent for trend. */
  dividend?: DividendSignals | null;
  /** Research availability for the value-quality data (research-unavailable-state
   *  M3). When off/capped/failed the quality is UNVERIFIED — flagged to the
   *  prosecutor as a weakness, not a free pass. Value lens only. */
  researchStatus?: ResearchStatus | null;
  thesis: string;
  reasoning?: string;
  research?: string;
}

/** A concise cash-flow descriptor for the value prosecutor, tagged with the
 *  pure pass/flag assessment. "unknown" when no usable FCF data was returned —
 *  itself a weakness for a value call (the floor can't be verified). */
function cashFlowBriefing(
  cf: CashFlowQuality | null | undefined,
  researchStatus?: ResearchStatus | null,
  sector?: string | null,
): string {
  if (!hasCashFlowData(cf ?? null) || !cf) {
    // research-unavailable-state M3: distinguish "research off/capped/failed" from
    // "ran but returned nothing" — either way the quality is UNVERIFIED.
    const reason = researchUnavailableLabel(researchStatus);
    return reason
      ? `Cash-flow quality: DATA UNAVAILABLE (${reason}) — quality could NOT be verified; treat this as a weakness, not a free pass`
      : "Cash-flow quality: unknown (no FCF / leverage data returned — the floor cannot be verified, treat the absence as a weakness)";
  }
  // red-team-fixes Issue 1: for Finance-sector names, drop the generic
  // leverage/coverage/net-debt figures — they are category errors here and would
  // misfire as value-trap signals (banks/insurers run high leverage by design).
  const financial = isFinancialSector(sector);
  const bits: string[] = [];
  if (cf.freeCashFlow !== null) {
    bits.push(`FCF ${formatCompactCurrency(cf.freeCashFlow)}`);
  }
  if (cf.fcfTrend) bits.push(`FCF trend ${cf.fcfTrend}`);
  if (cf.fcfYield !== null) {
    bits.push(`FCF yield ${formatPercent(cf.fcfYield, { signed: false })}`);
  }
  if (cf.operatingCashFlow !== null) {
    bits.push(`OCF ${formatCompactCurrency(cf.operatingCashFlow)}`);
  }
  if (!financial && cf.netDebt !== null) {
    bits.push(`net debt ${formatCompactCurrency(cf.netDebt)}`);
  }
  if (!financial && cf.debtToEquity !== null) {
    bits.push(`D/E ${cf.debtToEquity.toFixed(1)}`);
  }
  if (!financial && cf.interestCoverage !== null) {
    bits.push(`interest coverage ${cf.interestCoverage.toFixed(1)}x`);
  }
  const { status } = assessCashFlowQuality(cf, { sector });
  const note = financial
    ? " — FINANCIAL-SECTOR name: generic D/E, net debt, and interest coverage are CATEGORY ERRORS for a deposit-/float-funded business (high leverage is by design) — they are NOT solvency or value-trap signals; do NOT cite D/E, net debt, or interest coverage as a flaw here"
    : "";
  return `Cash-flow quality (${status}): ${bits.join(", ")}${note}`;
}

/** A concise dividend descriptor for the value prosecutor (dividend-floor M1),
 *  tagged with the pure floor assessment so it can recognize a real floor vs. an
 *  at-risk dividend. "no dividend / unknown" when the company pays none. */
function dividendBriefing(d: DividendSignals | null | undefined): string {
  if (!hasDividendData(d ?? null) || !d) {
    return "Dividend: none / unknown (no dividend floor to credit here)";
  }
  const bits: string[] = [];
  if (d.dividendYield !== null) {
    bits.push(`yield ${formatPercent(d.dividendYield, { signed: false })}`);
  }
  if (d.payoutRatio !== null) {
    bits.push(`payout ${formatPercent(d.payoutRatio, { signed: false })}`);
  }
  const coverage = dividendCoverage(d);
  if (coverage !== null) bits.push(`FCF covers ${coverage.toFixed(1)}x`);
  if (d.growthStreakYears !== null) {
    bits.push(`${d.growthStreakYears}-yr growth streak`);
  }
  if (d.dividendCagr !== null) {
    bits.push(`${formatPercent(d.dividendCagr, { signed: false })} CAGR`);
  }
  const { status } = assessDividendFloor(d);
  const verdict =
    status === "pass"
      ? "a durable, covered dividend = a REAL floor"
      : status === "flag"
        ? "uncovered / at-risk — a value-trap flag, NOT a floor"
        : "pays a dividend but coverage unconfirmed";
  return `Dividend sustainability (${status} — ${verdict}): ${bits.join(", ")}`;
}

/** A short date (YYYY-MM-DD) for a raw news timestamp, or "" when unparseable. */
function shortDate(ts: string | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : ` ${d.toISOString().slice(0, 10)}`;
}

/** Brief the prosecutor on the catalyst's sources (catalyst-news-sources M1) so
 *  it can verify the catalyst is backed by real, datable headlines. Empty string
 *  when there are none (then only the catalyst line is shown). */
function catalystSourcesBriefing(sources: CatalystSource[] | null | undefined): string {
  const list = (sources ?? []).filter((s) => s.headline?.trim());
  if (list.length === 0) return "";
  const bullets = list
    .slice(0, 5)
    .map(
      (s) =>
        `  · "${s.headline.trim()}" — ${s.publisher || "source"}${shortDate(s.publishedAt)}`,
    )
    .join("\n");
  return `- Catalyst sources (the catalyst is backed by these dated headlines — it is NOT catalyst-free):\n${bullets}`;
}

export type RedTeamExec = (prompt: string) => Promise<string>;
export type RedTeamOutcome = "allow" | "downsize" | "block";

export function buildProsecutorPrompt(p: RedTeamProposal): string {
  // Core-long is its own lens — never merged with trend/value/mid (core-long M3).
  const isCore = p.sleeve === "core-long";
  const isValue =
    !isCore &&
    (p.sleeve ? sleeveToStrategy(p.sleeve) : p.strategy) === "value";
  const mandateLabel = isCore
    ? "LONG-TERM / CORE"
    : isValue
      ? "VALUE / MEAN-REVERSION"
      : "TREND";
  // catalyst-state-honesty M2: a FAILED fetch is "unavailable", NOT a real
  // "no catalyst" — the prosecutor must not reject on that basis.
  const catalystUnavailable = p.catalystState === "unavailable";
  const catalystLine = catalystUnavailable
    ? "- Catalyst: DATA UNAVAILABLE — the catalyst/news fetch FAILED (UNVERIFIED, NOT absent)"
    : `- Catalyst: ${p.catalyst ? p.catalyst : "none stated"} (${p.catalystType ?? "unspecified"})`;
  const attackLine = isCore
    ? "Attack the weakest link: OVERPAYING vs long-term value, thesis drift / a speculative 'story' stock dressed up as core, OVER-CONCENTRATION vs the target allocation, weak FUND QUALITY (expense ratio / tracking error / structure) for an ETF, or an unrealistic long-term return assumption."
    : isValue
      ? "Attack the weakest link: a deteriorating / broken business under a bid, the absence of a real catalyst or floor, a falling-knife with no support, an unrealistic target, or a thin reward/risk."
      : "Attack the weakest link: crowded positioning, valuation, event/earnings risk, a stop that is too wide for the catalyst, weak relative strength, or a thin reward/risk.";
  const mandateNoun = isCore
    ? "long-term / core"
    : isValue
      ? "value / mean-reversion"
      : "trend";
  const levelsLine = isCore
    ? `- Sizing: target weight ${p.targetWeightPct != null ? `${(p.targetWeightPct * 100).toFixed(0)}%` : "unspecified"} · review trigger ${p.reviewTriggerPct != null ? `−${(p.reviewTriggerPct * 100).toFixed(0)}%` : "none"} · no protective stop (by design)`
    : `- Stop: ${p.stopPrice ?? "none"} · Target: ${p.takeProfit ?? "none"} (${p.targetType ?? "unspecified"})`;
  const lines = [
    `You are a HOSTILE RED-TEAM PROSECUTOR reviewing a proposed PAPER ${isCore ? "long-term / core position" : "swing trade"}, judged under the desk's ${mandateLabel} mandate.`,
    "You are a different model family from the one that proposed it. Your job is to REFUTE the thesis, not to agree.",
    "DEFAULT TO NO. Only return approve if the thesis is genuinely robust against your strongest objections.",
    attackLine,
    "",
    "Proposed order:",
    `- Ticker: ${p.symbol}`,
    `- Mandate: ${mandateNoun}`,
    `- Side/Action: ${p.action} ${p.side}`,
    `- Qty: ${p.qty} @ limit ${p.limitPrice}`,
    levelsLine,
    `- Relative volume: ${p.relativeVolume != null ? `${p.relativeVolume.toFixed(2)}x avg` : "unknown"}`,
    catalystLine,
  ];
  const sourcesLine = catalystSourcesBriefing(p.catalystSources);
  if (sourcesLine) lines.push(sourcesLine);
  // The unavailable override is authoritative — placed BEFORE the mandate guidance
  // so the prosecutor never treats a failed fetch as "no catalyst".
  if (catalystUnavailable) {
    lines.push(
      "- CATALYST DATA UNAVAILABLE — IMPORTANT: the catalyst/news fetch FAILED, so the catalyst is UNVERIFIED, NOT confirmed-absent. Do NOT treat this as 'no catalyst' / 'catalyst-free' and do NOT reject or flag on that basis. Note the data should be re-fetched, and judge the rest of the thesis (trend, stop, reward/risk, structure) on its merits.",
    );
  }
  // Cash-flow quality + dividend sustainability are VALUE-lens signals only —
  // surface the figures in the order block so the prosecutor weighs the
  // floor-vs-trap tell and recognizes a real dividend floor.
  if (isValue || isCore) {
    // Cash-flow quality is the business-quality tell for both value and core (a
    // core single name must be a durable, self-funding business); a core ETF/index
    // simply has no cash-flow data and is judged on fund quality instead.
    lines.push(`- ${cashFlowBriefing(p.cashFlow, p.researchStatus, p.sector)}`);
  }
  if (isValue) {
    lines.push(`- ${dividendBriefing(p.dividend)}`);
  }
  lines.push(`- Thesis: ${p.thesis}`);
  if (isCore) {
    lines.push(
      "LONG-TERM / CORE MANDATE — judge this as a multi-year buy-and-hold ALLOCATION, not a swing trade. Apply the RIGHT criteria:",
      "COUNTER-TREND & NO NEAR-TERM CATALYST ARE NORMAL. This is a quarters-to-years core holding. Being below the moving averages, in a drawdown, or having NO near-term catalyst is EXPECTED and is NOT by itself a reason to reject. Do NOT apply trend/swing timing or momentum rules, and do NOT flag 'no catalyst' / 'counter-trend' here.",
      "NO PROTECTIVE STOP IS BY DESIGN. A core position is sized to a TARGET WEIGHT and governed by a wide DRAWDOWN/REVIEW TRIGGER, not a stop. Do NOT cite 'no stop' or 'no profit target' as a flaw.",
      "PROSECUTE OVERPAYING vs LONG-TERM VALUE — this is your real job. Is the entry expensive vs its own long-term history / a reasonable long-term valuation (for a single name) or vs sensible long-horizon expectations (for a fund)? Buying a good asset at a rich price is a real objection — flag it in the Edge factor.",
      "PROSECUTE THESIS DRIFT / STORY STOCK. Is this a durable, high-quality business or a low-cost diversified fund — or a speculative narrative dressed up as 'core'? A non-durable, story-driven pick does NOT belong in a core book; flag it.",
      "PROSECUTE OVER-CONCENTRATION vs the TARGET ALLOCATION. Weigh the target weight above: an oversized single position relative to the intended allocation is a concentration risk — flag it.",
      "FOR AN ETF / INDEX FUND, judge FUND QUALITY: is the expense ratio LOW (a high fee compounds against the holder for years), is tracking error tight, and is the structure / liquidity sound? A high-expense, poorly-tracking, or thin/exotic fund is a real objection — say so in the Edge factor.",
      "PROSECUTE AN UNREALISTIC LONG-TERM RETURN ASSUMPTION. A thesis premised on an implausible compounding / growth rate over the holding horizon is weak.",
      "A target anchored to long-term fundamental value (or, for a fund, a sensible long-horizon expectation) is APPROPRIATE for this sleeve. A core ETF/index may legitimately have NO price target — do NOT call that weak. A sell-side analyst_price target is still borrowed conviction.",
    );
  } else if (isValue) {
    lines.push(
      "VALUE / MEAN-REVERSION MANDATE — judge under the RIGHT criteria, not the trend rules:",
      "COUNTER-TREND IS EXPECTED. This is a value / mean-reversion entry, NOT a trend trade. Being BELOW the 50-/200-day moving averages, in a downtrend, or making lower lows is NORMAL here and is NOT by itself a reason to reject. Do NOT penalize the thesis merely for being below its moving averages, 'fighting the trend', or lacking upside momentum — that would be applying the wrong mandate.",
      "FUNDAMENTALS LEAD. Judge QUALITY first: is this a profitable, durable business with a sound balance sheet, trading at a genuine discount (cheap vs its own history / peers, near a multi-year or 52-week low)? A fundamental / valuation rationale is IN MANDATE for this sleeve.",
      "HUNT THE VALUE TRAP — this is your real job. REJECT (or at least flag concern) for: deteriorating fundamentals (falling revenue / margins, cut guidance, slashed analyst targets), NO real catalyst or floor, a falling-knife / structurally broken business, or an unrealistic target. A valid why-now is a dividend support or hike, an analyst-target floor, insider buying, fundamental stabilization, OR a technical mean-reversion signal (oversold RSI, long-term support, capitulation volume, basing). 'It's just cheap' with no catalyst or floor is WEAK — flag it in the Edge factor.",
      "CASH FLOW IS THE FLOOR-VS-TRAP TELL. Weigh the Cash-flow quality line above: strong, positive, stable/growing free cash flow with a healthy FCF yield and manageable leverage SUPPORTS the floor thesis (a business that funds itself rarely keeps falling) — lean toward giving the value call a fair hearing. Conversely, NEGATIVE or DECLINING free cash flow, a deteriorating OCF, or RISING / heavy leverage (high debt-to-equity, thin interest coverage) is a STRONG value-trap red flag — a cheap stock bleeding cash with a stretched balance sheet is a falling knife, not a floor; REJECT or flag concern and say so in the Edge factor. Unknown cash flow means the floor is unverified — a weakness, not a free pass. Good cash flow alone does NOT make it a buy; its absence/deterioration is a strong disqualifier.",
      "DIVIDEND SUSTAINABILITY CAN BE THE FLOOR. Weigh the Dividend sustainability line above. A durable, well-covered dividend (FCF comfortably covers it, payout not stretched, a multi-year growth streak) IS a real value floor — downside protection that pays you to wait. When such a floor is present (it will be stated in the Catalyst line as a 'Dividend floor: …'), it SATISFIES the why-now/floor requirement: do NOT reject merely for 'no catalyst or floor.' BUT a safe dividend is NOT automatically a why-now price catalyst — a covered dividend can coexist with a multi-year price decline (a value trap that pays you to wait), so you MAY still reasonably weigh timing/why-now and land on concern. Do NOT let 'safe dividend' alone force an approve. An UNCOVERED or at-risk dividend (FCF doesn't cover it, payout stretched, cut risk) is a value-trap red flag, NOT a floor — call it out in the Edge factor.",
      "A target anchored to FUNDAMENTAL value is APPROPRIATE for this sleeve (do NOT call it weak). A sell-side analyst_price target is still weak (borrowed conviction); an unspecified target is weak. Note this in the Target factor.",
    );
    // red-team-fixes Issue 1: a Finance-sector name's leverage is by design —
    // neutralize the generic value-trap framing for it so the prosecutor never
    // cites D/E / net debt / interest coverage as the fatal flaw.
    if (isFinancialSector(p.sector)) {
      lines.push(
        "FINANCIAL-SECTOR NAME — LEVERAGE/COVERAGE CAVEAT (overrides the cash-flow value-trap framing above): this is a Finance-sector company (bank / insurer / capital markets). Debt-to-equity, 'net debt', and interest coverage computed the generic way are CATEGORY ERRORS here — such businesses are deposit-/float-funded and carry high leverage and large debt balances BY DESIGN, so a high D/E or a low 'interest coverage' is NORMAL and is NOT a solvency or value-trap signal. Do NOT cite D/E, net debt, or interest coverage as a flaw for this name. Judge the floor on catalyst / why-now quality and, where available, bank-appropriate metrics (ROA/ROE, capital adequacy, net interest margin, efficiency ratio, NPL/credit trend) instead.",
      );
    }
  } else {
    // red-team-fixes Issue 2 — explicit TREND why-now precedence. A trend
    // setup is structure-and-momentum driven, so a volume-confirmed entry
    // (relative volume ≥ REL_VOLUME_BREAKOUT_MIN) ALREADY satisfies the
    // "why now"; a far-dated or absent named catalyst may lower conviction but
    // must NOT, on its own, force a reject. When volume does NOT confirm, the
    // catalyst has to carry the why-now and the original weak-catalyst framing
    // applies.
    const volumeConfirmed =
      p.relativeVolume != null && p.relativeVolume >= REL_VOLUME_BREAKOUT_MIN;
    const catalystLineTrend = catalystUnavailable
      ? "CATALYST (why NOW): the catalyst data is UNAVAILABLE (the fetch failed) — treat it as unverified, NOT confirmed-absent. Do NOT flag 'no catalyst' or reject on that basis here; note it should be re-fetched and weigh the technical thesis."
      : volumeConfirmed
        ? `CATALYST (why NOW) — TREND PRECEDENCE RULE: this is a TREND mandate (structure-and-momentum driven) and the entry is VOLUME-CONFIRMED (relative volume ${p.relativeVolume!.toFixed(2)}x ≥ ${REL_VOLUME_BREAKOUT_MIN}x avg). Volume-confirmed structure SATISFIES the "why now" for a trend setup. A far-dated, weak, or even absent named catalyst is NOT by itself sufficient grounds to REJECT — at most it LOWERS conviction (lean toward "concern"). Do NOT reject a volume-confirmed trend purely because its named catalyst (e.g. earnings) is weeks or months away.`
        : `CATALYST (why NOW): with volume UNCONFIRMED (relative volume below ${REL_VOLUME_BREAKOUT_MIN}x avg or unknown), the catalyst must carry the why-now. A proposal with NO named catalyst (catalyst_type 'none' / trend alone) AND no volume confirmation is a momentum chase with nothing behind it — WEAK. Flag a missing or 'none' catalyst in the Edge factor and lean toward concern.`;
    lines.push(
      catalystLineTrend,
      "VOLUME CONFIRMATION (the trend why-now test): a breakout/momentum entry should come on ABOVE-AVERAGE relative volume (≥ 1.3x); a pullback/reset entry should come on DECLINING / below-average volume. Relative volume well below 1x on a breakout, or a volume spike on a pullback, is a weakness — call it out in the Entry factor. Unknown volume is not itself a strike, but a breakout claim with no volume confirmation is weaker.",
      "This is a TECHNICAL trend-following desk. The thesis must be PRIMARILY technical (trend, momentum, relative strength, volume, price structure). If the primary rationale is fundamental or valuation ('cheap', 'undervalued', 'earnings growth', 'analyst upgrade') rather than price/trend evidence, it is OUT OF MANDATE — penalize it in the Edge factor and lean toward reject or concern. Fundamentals are only a catalyst-check / disqualifier, never the primary reason to enter.",
      "A target anchored to a sell-side analyst_price — or left unspecified — is WEAK (the desk is borrowing someone else's number, not its own thesis); call it out in the Target factor.",
    );
  }
  lines.push(
    isCore
      ? "SLEEVE RAILS (core-long): this position carries NO protective stop and NO fixed profit target BY DESIGN — it is sized to a target weight (within the sleeve size cap) and reviewed on a wide drawdown trigger. Reward/risk-to-stop does NOT apply. Do NOT cite a missing stop, missing target, or thin reward/risk as a strike here; judge value, quality, concentration, and (for a fund) cost instead."
      : `SHARED HARD RAILS (both mandates, unchanged): the entry needs a protective stop, reward/risk ≥ ${MIN_REWARD_RISK}:1, and risk sized within the charter caps. A missing/too-wide stop or a thin reward/risk is a strike regardless of mandate.`,
  );
  if (p.reasoning) lines.push(`- Reasoning: ${p.reasoning}`);
  if (p.research) lines.push(`- Research: ${p.research}`);
  lines.push(
    "",
    "Respond with ONLY a JSON object, no prose, with this exact shape:",
    '{"verdict":"approve"|"reject"|"concern",' +
      '"notes":"<your single strongest objection or, if approving, why it survived>",' +
      '"factors":[{"label":"Entry"|"Target"|"Stop"|"Edge"|"Reward/Risk","assessment":"<one short sentence>","stance":"supports"|"refutes"|"neutral"}],' +
      '"basis":"<one line: how you decided / your conviction>"}',
    "Include a factor for each of Entry, Target, Stop, Edge, and Reward/Risk. " +
      'stance is from YOUR adversarial view: "refutes" = a weakness/objection, ' +
      '"supports" = it holds up, "neutral" = mixed.',
    '"reject" = do not trade. "concern" = trade only at reduced size. "approve" = the thesis survived your attack.',
  );
  return lines.join("\n");
}

const VERDICT_SYNONYMS: Record<string, "approve" | "reject" | "concern"> = {
  approve: "approve",
  yes: "approve",
  ok: "approve",
  pass: "approve",
  reject: "reject",
  no: "reject",
  block: "reject",
  deny: "reject",
  concern: "concern",
  caution: "concern",
  downsize: "concern",
  maybe: "concern",
};

function extractJsonObject(raw: string): unknown {
  const fenced = raw.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("no JSON object found in prosecutor output");
  }
  return JSON.parse(fenced.slice(start, end + 1));
}

const STANCE_VALUES = new Set(["supports", "refutes", "neutral"]);

function normalizeStance(raw: unknown): "supports" | "refutes" | "neutral" {
  const s = String(raw ?? "").trim().toLowerCase();
  return STANCE_VALUES.has(s) ? (s as "supports" | "refutes" | "neutral") : "neutral";
}

/** Pull the structured factors out, defensively — skip any factor missing a
 *  label or assessment so a malformed entry never fails the whole verdict. */
function normalizeFactors(raw: unknown): RedTeamVerdict["factors"] {
  if (!Array.isArray(raw)) return [];
  const out: RedTeamVerdict["factors"] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const rec = f as Record<string, unknown>;
    const label = String(rec.label ?? "").trim();
    const assessment = String(rec.assessment ?? "").trim();
    if (!label || !assessment) continue;
    out.push({ label, assessment, stance: normalizeStance(rec.stance) });
  }
  return out;
}

/** Parse + normalize the prosecutor's output into a validated verdict. Throws
 *  if no usable verdict can be found. Structured factors + basis are parsed
 *  best-effort and default to `[]` / `null` (back-compatible with bare
 *  verdict+notes output). */
export function parseVerdict(raw: string): RedTeamVerdict {
  const obj = extractJsonObject(raw);
  if (obj === null || typeof obj !== "object") {
    throw new Error("prosecutor output is not an object");
  }
  const record = obj as Record<string, unknown>;
  const rawVerdict = String(record.verdict ?? "").trim().toLowerCase();
  const normalized = VERDICT_SYNONYMS[rawVerdict];
  if (!normalized) {
    throw new Error(`unrecognized verdict "${record.verdict}"`);
  }
  const basis = String(record.basis ?? "").trim();
  return RedTeamVerdictSchema.parse({
    verdict: normalized,
    notes: String(record.notes ?? "").trim() || "(no notes provided)",
    factors: normalizeFactors(record.factors),
    basis: basis || null,
  });
}

export function redTeamOutcome(verdict: RedTeamVerdict): RedTeamOutcome {
  switch (verdict.verdict) {
    case "reject":
      return "block";
    case "concern":
      return "downsize";
    case "approve":
      return "allow";
  }
}

/** Run the prosecutor. Fails closed to a reject if it errors or is unparseable. */
export async function runRedTeam(
  proposal: RedTeamProposal,
  opts?: { exec?: RedTeamExec },
): Promise<RedTeamVerdict> {
  const exec = opts?.exec ?? defaultCodexExec;
  try {
    const raw = await exec(buildProsecutorPrompt(proposal));
    return parseVerdict(raw);
  } catch (err) {
    return {
      verdict: "reject",
      notes: `Red-team unavailable or unparseable — defaulting to NO. (${
        (err as Error).message
      })`,
      factors: [],
      basis: null,
    };
  }
}

/** The codex binary to spawn. Defaults to `codex` (PATH-resolved), but can be
 *  pinned via `CODEX_BIN` — needed when a broken/shadowing codex is earlier on
 *  the PATH (e.g. an nvm `@openai/codex` whose native binary is missing, which
 *  shadows a working Homebrew install in the launchd daemon's PATH). */
const CODEX_BIN = process.env.CODEX_BIN || "codex";

/** Spawn `codex exec` (a different model family) and capture its stdout. */
const defaultCodexExec: RedTeamExec = (prompt) =>
  new Promise<string>((resolve, reject) => {
    // argv (no shell) so the prompt can't inject commands.
    const child = spawn(CODEX_BIN, ["exec", prompt], { cwd: process.cwd() });
    child.stdin.end(); // `codex exec` reads stdin; close it so it won't hang.

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("codex exec timed out"));
    }, 120_000);

    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim().slice(0, 500) || `codex exited ${code}`));
    });
  });
