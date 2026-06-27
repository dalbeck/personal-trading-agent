import "server-only";

import { spawn } from "node:child_process";
import { RedTeamVerdictSchema } from "@/lib/schemas";
import { assessCashFlowQuality, hasCashFlowData } from "@/lib/cash-flow";
import { formatCompactCurrency, formatPercent } from "@/lib/format";
import type { CashFlowQuality, RedTeamVerdict } from "@/lib/types";

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
  qty: number;
  limitPrice: number;
  stopPrice: number | null;
  takeProfit: number | null;
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
  /** Cash-flow quality for the VALUE mandate (value-cashflow M1) — the prosecutor
   *  weighs durable/positive FCF as floor support and negative/declining FCF +
   *  rising leverage as a value-trap red flag. Value lens only; null/absent for
   *  trend (the trend prompt never mentions it). */
  cashFlow?: CashFlowQuality | null;
  thesis: string;
  reasoning?: string;
  research?: string;
}

/** A concise cash-flow descriptor for the value prosecutor, tagged with the
 *  pure pass/flag assessment. "unknown" when no usable FCF data was returned —
 *  itself a weakness for a value call (the floor can't be verified). */
function cashFlowBriefing(cf: CashFlowQuality | null | undefined): string {
  if (!hasCashFlowData(cf ?? null) || !cf) {
    return "Cash-flow quality: unknown (no FCF / leverage data returned — the floor cannot be verified, treat the absence as a weakness)";
  }
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
  if (cf.netDebt !== null) {
    bits.push(`net debt ${formatCompactCurrency(cf.netDebt)}`);
  }
  if (cf.debtToEquity !== null) bits.push(`D/E ${cf.debtToEquity.toFixed(1)}`);
  if (cf.interestCoverage !== null) {
    bits.push(`interest coverage ${cf.interestCoverage.toFixed(1)}x`);
  }
  const { status } = assessCashFlowQuality(cf);
  return `Cash-flow quality (${status}): ${bits.join(", ")}`;
}

export type RedTeamExec = (prompt: string) => Promise<string>;
export type RedTeamOutcome = "allow" | "downsize" | "block";

export function buildProsecutorPrompt(p: RedTeamProposal): string {
  const isValue = p.strategy === "value";
  const lines = [
    `You are a HOSTILE RED-TEAM PROSECUTOR reviewing a proposed PAPER swing trade, judged under the desk's ${isValue ? "VALUE / MEAN-REVERSION" : "TREND"} mandate.`,
    "You are a different model family from the one that proposed it. Your job is to REFUTE the thesis, not to agree.",
    "DEFAULT TO NO. Only return approve if the thesis is genuinely robust against your strongest objections.",
    isValue
      ? "Attack the weakest link: a deteriorating / broken business under a bid, the absence of a real catalyst or floor, a falling-knife with no support, an unrealistic target, or a thin reward/risk."
      : "Attack the weakest link: crowded positioning, valuation, event/earnings risk, a stop that is too wide for the catalyst, weak relative strength, or a thin reward/risk.",
    "",
    "Proposed order:",
    `- Ticker: ${p.symbol}`,
    `- Mandate: ${isValue ? "value / mean-reversion" : "trend"}`,
    `- Side/Action: ${p.action} ${p.side}`,
    `- Qty: ${p.qty} @ limit ${p.limitPrice}`,
    `- Stop: ${p.stopPrice ?? "none"} · Target: ${p.takeProfit ?? "none"} (${p.targetType ?? "unspecified"})`,
    `- Relative volume: ${p.relativeVolume != null ? `${p.relativeVolume.toFixed(2)}x avg` : "unknown"}`,
    `- Catalyst: ${p.catalyst ? p.catalyst : "none stated"} (${p.catalystType ?? "unspecified"})`,
  ];
  // Cash-flow quality is a VALUE-lens signal only — surface the figures in the
  // order block so the prosecutor weighs the floor-vs-trap tell.
  if (isValue) {
    lines.push(`- ${cashFlowBriefing(p.cashFlow)}`);
  }
  lines.push(`- Thesis: ${p.thesis}`);
  if (isValue) {
    lines.push(
      "VALUE / MEAN-REVERSION MANDATE — judge under the RIGHT criteria, not the trend rules:",
      "COUNTER-TREND IS EXPECTED. This is a value / mean-reversion entry, NOT a trend trade. Being BELOW the 50-/200-day moving averages, in a downtrend, or making lower lows is NORMAL here and is NOT by itself a reason to reject. Do NOT penalize the thesis merely for being below its moving averages, 'fighting the trend', or lacking upside momentum — that would be applying the wrong mandate.",
      "FUNDAMENTALS LEAD. Judge QUALITY first: is this a profitable, durable business with a sound balance sheet, trading at a genuine discount (cheap vs its own history / peers, near a multi-year or 52-week low)? A fundamental / valuation rationale is IN MANDATE for this sleeve.",
      "HUNT THE VALUE TRAP — this is your real job. REJECT (or at least flag concern) for: deteriorating fundamentals (falling revenue / margins, cut guidance, slashed analyst targets), NO real catalyst or floor, a falling-knife / structurally broken business, or an unrealistic target. A valid why-now is a dividend support or hike, an analyst-target floor, insider buying, fundamental stabilization, OR a technical mean-reversion signal (oversold RSI, long-term support, capitulation volume, basing). 'It's just cheap' with no catalyst or floor is WEAK — flag it in the Edge factor.",
      "CASH FLOW IS THE FLOOR-VS-TRAP TELL. Weigh the Cash-flow quality line above: strong, positive, stable/growing free cash flow with a healthy FCF yield and manageable leverage SUPPORTS the floor thesis (a business that funds itself rarely keeps falling) — lean toward giving the value call a fair hearing. Conversely, NEGATIVE or DECLINING free cash flow, a deteriorating OCF, or RISING / heavy leverage (high debt-to-equity, thin interest coverage) is a STRONG value-trap red flag — a cheap stock bleeding cash with a stretched balance sheet is a falling knife, not a floor; REJECT or flag concern and say so in the Edge factor. Unknown cash flow means the floor is unverified — a weakness, not a free pass. Good cash flow alone does NOT make it a buy; its absence/deterioration is a strong disqualifier.",
      "A target anchored to FUNDAMENTAL value is APPROPRIATE for this sleeve (do NOT call it weak). A sell-side analyst_price target is still weak (borrowed conviction); an unspecified target is weak. Note this in the Target factor.",
    );
  } else {
    lines.push(
      "CATALYST (why NOW): a sound entry names a catalyst — earnings momentum, product news, sector rotation, guidance, etc. A proposal with NO named catalyst (catalyst_type 'none' / trend alone) is a momentum chase with nothing behind it — WEAK. Flag a missing or 'none' catalyst in the Edge factor and lean toward concern.",
      "VOLUME CONFIRMATION (soft signal — weigh it, do not treat as a hard rail): a breakout/momentum entry should come on ABOVE-AVERAGE relative volume (~1.3x or more); a pullback/reset entry should come on DECLINING / below-average volume. Relative volume well below 1x on a breakout, or a volume spike on a pullback, is a weakness — call it out in the Entry factor. Unknown volume is not itself a strike, but a breakout claim with no volume confirmation is weaker.",
      "This is a TECHNICAL trend-following desk. The thesis must be PRIMARILY technical (trend, momentum, relative strength, volume, price structure). If the primary rationale is fundamental or valuation ('cheap', 'undervalued', 'earnings growth', 'analyst upgrade') rather than price/trend evidence, it is OUT OF MANDATE — penalize it in the Edge factor and lean toward reject or concern. Fundamentals are only a catalyst-check / disqualifier, never the primary reason to enter.",
      "A target anchored to a sell-side analyst_price — or left unspecified — is WEAK (the desk is borrowing someone else's number, not its own thesis); call it out in the Target factor.",
    );
  }
  lines.push(
    "SHARED HARD RAILS (both mandates, unchanged): the entry needs a protective stop, reward/risk ≥ 2:1, and risk sized within the charter caps. A missing/too-wide stop or a thin reward/risk is a strike regardless of mandate.",
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
