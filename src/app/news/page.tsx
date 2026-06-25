import { OwnershipBadge, ViewingBadge } from "@/components/mode-scope";
import { Card, PageTitle } from "@/components/page-shell";
import { SampleDataBadge, SampleDataBanner } from "@/components/sample-data-badge";
import { TickerLink } from "@/components/ticker-link";
import { TrackedUniverseCard } from "@/components/tracked-universe";
import { formatDateTime } from "@/lib/format";
import { anySample } from "@/lib/sample-data";
import { classifyOwnership } from "@/lib/universe";
import { readMaterialNews } from "@/lib/server/data";
import { getViewMode } from "@/lib/server/mode";
import { getTrackedUniverse } from "@/lib/server/universe";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const [items, mode] = await Promise.all([readMaterialNews(), getViewMode()]);
  const universe = await getTrackedUniverse(mode);

  // The scout watches the global universe (paper + live holdings + watchlist);
  // this page scopes News to the ACTIVE book's universe so the view matches the
  // selected mode. Owned/watched names are the only ones the scout tags.
  const tracked = new Set(universe.symbols);
  const visible = items.filter((it) => tracked.has(it.symbol));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <PageTitle
          title="News"
          subtitle="Headlines the scout judged material to a tracked name — holdings + your watchlist."
        />
        <div className="mt-2 flex items-center gap-2">
          <ViewingBadge mode={mode} />
        </div>
      </div>

      <TrackedUniverseCard universe={universe} mode={mode} />

      <SampleDataBanner show={anySample(visible)} />

      {visible.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-pretty text-sm text-fg-muted">
            {universe.symbols.length === 0
              ? `Nothing tracked in the ${mode} book yet — hold a position or add a watchlist symbol, then the scout will surface material headlines here.`
              : "No material news yet for the tracked universe. The scout surfaces only headlines relevant to a held or watched name."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((item) => (
            <Card key={`${item.seenAt}-${item.link}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TickerLink
                    symbol={item.symbol}
                    className="font-semibold text-fg"
                  />
                  <OwnershipBadge
                    ownership={classifyOwnership(item.symbol, universe)}
                  />
                  {item.sample ? <SampleDataBadge /> : null}
                </div>
                <time className="text-xs text-fg-muted" dateTime={item.seenAt}>
                  {formatDateTime(item.seenAt)}
                </time>
              </div>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 block text-pretty text-sm font-medium text-fg underline-offset-2 hover:underline"
              >
                {item.title}
              </a>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-fg-muted">
                <span>{item.source}</span>
                <span>{item.reason}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
