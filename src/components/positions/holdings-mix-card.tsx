import { CompositionRing } from "@/components/charts/composition-ring";
import { Card, SectionTitle } from "@/components/page-shell";
import { formatCurrency } from "@/lib/format";
import type { Position } from "@/lib/types";

/**
 * Sidebar card visualizing the active book's holdings mix as a composition
 * donut — top 6 positions by market value, with any remainder folded into an
 * "Other" slice so the ring always totals the book. Pure presentation over the
 * positions already fetched by the page; renders only when there are ≥2
 * positions (a single holding has no meaningful mix). The center well carries
 * the open-position count.
 */
export function HoldingsMixCard({ positions }: { positions: Position[] }) {
  const ranked = [...positions]
    .filter((p) => p.marketValue > 0)
    .sort((a, b) => b.marketValue - a.marketValue);

  if (ranked.length < 2) return null;

  const top = ranked.slice(0, 6);
  const rest = ranked.slice(6);
  const restValue = rest.reduce((s, p) => s + p.marketValue, 0);

  const slices = top.map((p) => ({
    label: p.symbol,
    value: p.marketValue,
    valueText: formatCurrency(p.marketValue),
  }));
  if (restValue > 0) {
    slices.push({
      label: `Other (${rest.length})`,
      value: restValue,
      valueText: formatCurrency(restValue),
    });
  }

  return (
    <Card className="flex flex-col gap-5">
      <SectionTitle title="Holdings mix" />
      <CompositionRing
        slices={slices}
        title="Holdings mix"
        centerValue={String(positions.length)}
        centerLabel="Open"
      />
    </Card>
  );
}
