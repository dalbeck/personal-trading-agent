import { researchUnavailableLabel } from "@/lib/research-availability";
import type { ResearchStatus } from "@/lib/types";

/**
 * Explicit "data unavailable" state (research-unavailable-state M3). When the
 * metered research that backs a proposal's value-quality data was off / capped /
 * failed, the affected block says so plainly — instead of a silent "—" that reads
 * like "verified, nothing there." Names the reason, and is honest that the gap
 * itself penalizes conviction and is treated by the red-team as unverified.
 */
export function ResearchUnavailableNotice({
  status,
  field = "Cash-flow quality",
}: {
  status: ResearchStatus | null | undefined;
  /** What the missing data is, for the sentence (e.g. "Cash-flow quality"). */
  field?: string;
}) {
  const reason = researchUnavailableLabel(status);
  return (
    <div className="rounded-input border border-warning/30 bg-warning-surface px-3 py-2.5 text-sm text-warning">
      <p className="font-semibold">
        {field}: data unavailable{reason ? ` · ${reason}` : ""}
      </p>
      <p className="mt-1 text-pretty text-xs leading-relaxed">
        The metered research that verifies this couldn&apos;t be obtained, so the
        quality is <strong>unverified</strong> — not confirmed-clean. Conviction is
        penalized for the missing data and the red-team treats it as a weakness.
      </p>
    </div>
  );
}
