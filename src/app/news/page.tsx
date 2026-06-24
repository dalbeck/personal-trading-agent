import { Card, PageTitle } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { readMaterialNews } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const items = await readMaterialNews();

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="News"
        subtitle="Headlines the scout judged material to a current paper holding."
      />
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
                <Badge tone="accent">{item.symbol}</Badge>
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
