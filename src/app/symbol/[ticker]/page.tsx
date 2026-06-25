import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LinkOuts } from "@/components/symbol/link-outs";
import { PriceChart } from "@/components/symbol/price-chart";
import { QuoteStats } from "@/components/symbol/quote-stats";
import { DataSourceNotice } from "@/components/data-source-notice";
import { Card } from "@/components/page-shell";
import { formatCurrency, formatDateTime, formatPercent } from "@/lib/format";
import { isValidSymbol, normalizeSymbol, DEFAULT_RANGE } from "@/lib/symbol";
import { getSymbolDetail } from "@/lib/server/symbol";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const symbol = normalizeSymbol(ticker);
  return { title: `${symbol} · Trading Cockpit` };
}

export default async function SymbolPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = await params;
  const symbol = normalizeSymbol(ticker);
  if (!isValidSymbol(symbol)) notFound();

  const detail = await getSymbolDetail(symbol, DEFAULT_RANGE);
  const { quote, available, news } = detail;

  const changeTone =
    quote?.change == null
      ? "text-fg-muted"
      : quote.change > 0
        ? "text-gain"
        : quote.change < 0
          ? "text-loss"
          : "text-fg-muted";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-1.5 text-xs text-fg-muted"
        >
          <Link href="/positions" className="rounded hover:text-fg">
            Positions
          </Link>
          <span aria-hidden>/</span>
          <span className="font-medium text-fg">{symbol}</span>
        </nav>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-3xl font-semibold tracking-tight text-fg">
            {symbol}
          </h1>
          {quote?.price != null ? (
            <span className="text-2xl font-semibold tabular-nums text-fg">
              {formatCurrency(quote.price)}
            </span>
          ) : null}
          {quote?.change != null ? (
            <span className={`text-sm font-medium tabular-nums ${changeTone}`}>
              {formatCurrency(quote.change, { signed: true })}
              {quote.changePct != null
                ? ` (${formatPercent(quote.changePct)})`
                : ""}
              <span className="ml-1 text-fg-muted">today</span>
            </span>
          ) : null}
        </div>
      </header>

      <DataSourceNotice notice={detail.notice} />

      {available ? (
        <>
          <PriceChart
            symbol={symbol}
            initialPoints={detail.bars}
            initialRange={detail.range}
          />

          {quote ? (
            <QuoteStats quote={quote} />
          ) : (
            <Card className="border-dashed">
              <p className="text-sm text-fg-muted">
                Quote snapshot unavailable right now — the chart above and the
                links below still work.
              </p>
            </Card>
          )}

          <section aria-labelledby="news-heading">
            <h2
              id="news-heading"
              className="mb-3 text-sm font-semibold text-fg"
            >
              Recent news
            </h2>
            {news.length === 0 ? (
              <Card className="border-dashed">
                <p className="text-sm text-fg-muted">
                  No recent headlines for {symbol} from the Alpaca news feed.
                </p>
              </Card>
            ) : (
              <ul className="flex flex-col gap-3">
                {news.map((item) => (
                  <li key={item.id}>
                    <Card>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
                        <span>{item.source || "News"}</span>
                        <time dateTime={item.publishedAt}>
                          {formatDateTime(item.publishedAt)}
                        </time>
                      </div>
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 block text-pretty text-sm font-medium text-fg underline-offset-2 hover:underline"
                        >
                          {item.title}
                        </a>
                      ) : (
                        <p className="mt-1.5 text-pretty text-sm font-medium text-fg">
                          {item.title}
                        </p>
                      )}
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}

      <section aria-labelledby="links-heading">
        <h2 id="links-heading" className="mb-1 text-sm font-semibold text-fg">
          Research links
        </h2>
        <p className="mb-3 text-xs text-fg-muted">
          Deep fundamentals and social sentiment we don&apos;t rebuild here —
          open in a new tab.
        </p>
        <LinkOuts symbol={symbol} />
      </section>
    </div>
  );
}
