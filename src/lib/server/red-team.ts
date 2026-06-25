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
    `- Stop: ${p.stopPrice ?? "none"} · Target: ${p.takeProfit ?? "none"}`,
    `- Thesis: ${p.thesis}`,
  ];
  if (p.reasoning) lines.push(`- Reasoning: ${p.reasoning}`);
  if (p.research) lines.push(`- Research: ${p.research}`);
  lines.push(
    "",
    'Respond with ONLY a JSON object, no prose: {"verdict": "approve" | "reject" | "concern", "notes": "<your strongest objection or, if approving, why it survived>"}.',
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

/** Parse + normalize the prosecutor's output into a validated verdict. Throws
 *  if no usable verdict can be found. */
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
  return RedTeamVerdictSchema.parse({
    verdict: normalized,
    notes: String(record.notes ?? "").trim() || "(no notes provided)",
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
