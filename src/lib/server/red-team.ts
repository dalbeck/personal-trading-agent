import "server-only";

import { spawn } from "node:child_process";
import { RedTeamVerdictSchema } from "@/lib/schemas";
import type { RedTeamVerdict } from "@/lib/types";

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
  thesis: string;
  reasoning?: string;
  research?: string;
}

export type RedTeamExec = (prompt: string) => Promise<string>;
export type RedTeamOutcome = "allow" | "downsize" | "block";

export function buildProsecutorPrompt(p: RedTeamProposal): string {
  const lines = [
    "You are a HOSTILE RED-TEAM PROSECUTOR reviewing a proposed PAPER swing trade.",
    "You are a different model family from the one that proposed it. Your job is to REFUTE the thesis, not to agree.",
    "DEFAULT TO NO. Only return approve if the thesis is genuinely robust against your strongest objections.",
    "Attack the weakest link: crowded positioning, valuation, event/earnings risk, a stop that is too wide for the catalyst, weak relative strength, or a thin reward/risk.",
    "",
    "Proposed order:",
    `- Ticker: ${p.symbol}`,
    `- Side/Action: ${p.action} ${p.side}`,
    `- Qty: ${p.qty} @ limit ${p.limitPrice}`,
    `- Stop: ${p.stopPrice ?? "none"} · Target: ${p.takeProfit ?? "none"} (${p.targetType ?? "unspecified"})`,
    `- Relative volume: ${p.relativeVolume != null ? `${p.relativeVolume.toFixed(2)}x avg` : "unknown"}`,
    `- Catalyst: ${p.catalyst ? p.catalyst : "none stated"} (${p.catalystType ?? "unspecified"})`,
    `- Thesis: ${p.thesis}`,
  ];
  lines.push(
    "CATALYST (why NOW): a sound entry names a catalyst — earnings momentum, product news, sector rotation, guidance, etc. A proposal with NO named catalyst (catalyst_type 'none' / trend alone) is a momentum chase with nothing behind it — WEAK. Flag a missing or 'none' catalyst in the Edge factor and lean toward concern.",
    "VOLUME CONFIRMATION (soft signal — weigh it, do not treat as a hard rail): a breakout/momentum entry should come on ABOVE-AVERAGE relative volume (~1.3x or more); a pullback/reset entry should come on DECLINING / below-average volume. Relative volume well below 1x on a breakout, or a volume spike on a pullback, is a weakness — call it out in the Entry factor. Unknown volume is not itself a strike, but a breakout claim with no volume confirmation is weaker.",
    "This is a TECHNICAL trend-following desk. The thesis must be PRIMARILY technical (trend, momentum, relative strength, volume, price structure). If the primary rationale is fundamental or valuation ('cheap', 'undervalued', 'earnings growth', 'analyst upgrade') rather than price/trend evidence, it is OUT OF MANDATE — penalize it in the Edge factor and lean toward reject or concern. Fundamentals are only a catalyst-check / disqualifier, never the primary reason to enter.",
    "A target anchored to a sell-side analyst_price — or left unspecified — is WEAK (the desk is borrowing someone else's number, not its own thesis); call it out in the Target factor.",
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
