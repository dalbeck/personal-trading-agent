import { ViewingBadge } from "@/components/mode-scope";
import { Card, PageTitle } from "@/components/page-shell";
import { SampleDataBadge, SampleDataBanner } from "@/components/sample-data-badge";
import { TickerLink } from "@/components/ticker-link";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { anySample } from "@/lib/sample-data";
import { readMaterialNews } from "@/lib/server/data";
import { getViewMode } from "@/lib/server/mode";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const [items, mode] = await Promise.all([readMaterialNews(), getViewMode()]);
  const isLive = mode === "live";

  // M1: the scout watches the PAPER book only. Wiring it to live holdings is the
  // tracked-universe milestone (M2), so the live view is honest about that gap
  // rather than showing paper headlines under a live label.
  if (isLive) {
    return (
      <div>
        <PageTitle
          title="News"
          subtitle="Headlines material to a current holding."
        />
        <div className="mb-4 flex items-center gap-2">
          <ViewingBadge mode="live" />
        </div>
        <Card className="border-dashed">
          <p className="text-pretty text-sm text-fg-muted">
            The scout currently watches the{" "}
            <span className="font-medium text-fg">paper book</span> only.
            Live-holdings news lands with the tracked-universe milestone (M2).
            Switch to the <span className="font-medium text-fg">Paper</span>{" "}
            view to see material headlines today.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title="News"
        subtitle="Headlines the scout judged material to a current paper holding."
      />
      <div className="mb-4 flex items-center gap-2">
        <ViewingBadge mode="paper" readOnly={false} />
        <span className="text-xs text-fg-muted">Paper holdings</span>
      </div>
      <SampleDataBanner show={anySample(items)} />
      {items.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-fg-muted">
            No material news yet. The scout surfaces only headlines relevant to
            an open position.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <Card key={`${item.seenAt}-${item.link}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="accent">
                    <TickerLink symbol={item.symbol} />
                  </Badge>
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
