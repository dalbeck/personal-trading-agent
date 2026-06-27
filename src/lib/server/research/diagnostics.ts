// src/lib/server/research/diagnostics.ts
import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PerplexityStatus } from "./types";

/**
 * Research-call observability (research-observability M1). Every research call —
 * success or failure — produces one `ResearchDiagnostic` so a silent `null` is
 * never the only signal. The provider logs + persists it; the orchestrator turns
 * it into a specific, human reason for the UI; the Logs page renders the ring.
 *
 * Internal state file (like the usage counter / cache), NOT a `data/` artifact
 * contract — written by us, read best-effort. Unreadable → empty, never an error.
 */

export type ResearchOutcome =
  | "ok"
  | "no-api-key"
  | "provider-off"
  | "daily-cap-reached"
  | "http-error"
  | "timeout"
  | "parse-error"
  | "network-error";

export interface ResearchDiagnostic {
  /** RFC3339 timestamp the call resolved. */
  at: string;
  /** Provider name, e.g. "perplexity". */
  provider: string;
  symbol: string;
  outcome: ResearchOutcome;
  /** HTTP status for `http-error`. */
  httpStatus?: number;
  /** Short body snippet for `http-error` (first ~200 chars), for diagnosis. */
  bodySnippet?: string;
  latencyMs: number;
  /** Real per-call cost (USD) when the API reported it (ok path only). */
  cost?: number;
}

const RING_CAP = 20;

/** A short, specific human reason for the UI/export — null when the call was ok. */
export function researchReasonText(d: ResearchDiagnostic): string | null {
  switch (d.outcome) {
    case "ok":
      return null;
    case "no-api-key":
      return "no API key configured";
    case "provider-off":
      return "research off";
    case "daily-cap-reached":
      return "daily research cap reached";
    case "http-error": {
      const billing =
        d.httpStatus === 401 || d.httpStatus === 402 || d.httpStatus === 403
          ? " (check API billing)"
          : "";
      return `HTTP ${d.httpStatus ?? "error"}${billing}`;
    }
    case "timeout":
      return "timed out (35s)";
    case "parse-error":
      return "response parse error";
    case "network-error":
      return "network error";
  }
}

/** Coarse status for the existing `PerplexityStatus` field. */
export function diagnosticToStatus(d: ResearchDiagnostic): PerplexityStatus {
  switch (d.outcome) {
    case "ok":
      return "ok";
    case "provider-off":
      return "off";
    case "daily-cap-reached":
      return "capped";
    default:
      return "unavailable";
  }
}

function ringFile(dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "research", "diagnostics.json");
}

/** Newest-first recent diagnostics; [] on miss/unreadable. */
export async function readResearchDiagnostics(opts?: {
  dataDir?: string;
}): Promise<ResearchDiagnostic[]> {
  try {
    const raw = await readFile(ringFile(opts?.dataDir), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ResearchDiagnostic[]) : [];
  } catch {
    return [];
  }
}

/** Prepend `d`, cap the ring, persist. Best-effort — never throws. */
export async function recordResearchDiagnostic(
  d: ResearchDiagnostic,
  opts?: { dataDir?: string },
): Promise<void> {
  try {
    const file = ringFile(opts?.dataDir);
    const prev = await readResearchDiagnostics(opts);
    const next = [d, ...prev].slice(0, RING_CAP);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  } catch {
    // Recording diagnostics must never break a research call.
  }
}
