import { Badge } from "@/components/ui/badge";
import { SAMPLE_DATA_MESSAGE } from "@/lib/sample-data";

/**
 * Page/module-level banner shown when a view renders one or more sample
 * records. Renders nothing when `show` is false, so callers can drop it in
 * unconditionally: `<SampleDataBanner show={anySample(items)} />`.
 */
export function SampleDataBanner({
  show,
  message = SAMPLE_DATA_MESSAGE,
}: {
  show: boolean;
  message?: string;
}) {
  if (!show) return null;
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-line bg-surface-raised px-4 py-2.5 text-sm text-fg-muted"
    >
      <Badge tone="neutral" dot>
        SAMPLE DATA
      </Badge>
      <span className="text-pretty">{message}</span>
    </div>
  );
}

/** Inline marker for an individual seeded record (e.g. on a proposal card). */
export function SampleDataBadge() {
  return (
    <Badge tone="muted" dot>
      Sample
    </Badge>
  );
}
