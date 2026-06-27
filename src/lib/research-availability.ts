/**
 * Research-availability display (research-unavailable-state M3). When the metered
 * Perplexity research that backs a proposal's value-quality data is **off /
 * capped / failed**, the cash-flow / quality fields should say **"data
 * unavailable"** explicitly — not a silent `—` that reads like "verified, nothing
 * there." These pure helpers translate the stored `researchStatus` into that
 * honest state, shared by the checklist, the detail view, and the export.
 *
 * Pure + unit-tested (`research-availability.test.ts`).
 */
import type { ResearchStatus } from "@/lib/types";

/** True when research was off / capped / failed — i.e. the quality data is
 *  unavailable, not merely empty. `ok` and `null` (unknown / older records) are
 *  treated as available so they are never retroactively marked unavailable. */
export function isResearchUnavailable(
  status: ResearchStatus | null | undefined,
): boolean {
  return status === "off" || status === "capped" || status === "unavailable";
}

/** A short reason the data is unavailable, for the UI / export — or null when
 *  research is available / unknown. */
export function researchUnavailableLabel(
  status: ResearchStatus | null | undefined,
): string | null {
  switch (status) {
    case "off":
      return "research off";
    case "capped":
      return "daily research cap reached";
    case "unavailable":
      return "research fetch failed";
    default:
      return null;
  }
}
