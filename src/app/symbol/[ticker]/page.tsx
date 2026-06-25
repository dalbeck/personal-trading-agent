import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AnalystConsensus } from "@/components/symbol/analyst-consensus";
import { CompanyProfileRail } from "@/components/symbol/company-profile";
import { SymbolCompanyHeader } from "@/components/symbol/company-header";
import { LinkOuts } from "@/components/symbol/link-outs";
import { PriceChart } from "@/components/symbol/price-chart";
import { SymbolResearchProvider } from "@/components/symbol/research-context";
import { SymbolResearchSummary } from "@/components/symbol/research-summary";
import { SymbolStatsGrid } from "@/components/symbol/stats-grid";
import { DataSourceNotice } from "@/components/data-source-notice";
import { Card } from "@/components/page-shell";
import { formatDateTime } from "@/lib/format";
import { MODE_LABEL } from "@/lib/mode";
import { isValidSymbol, normalizeSymbol, DEFAULT_RANGE } from "@/lib/symbol";
import { classifyOwnership } from "@/lib/universe";
import { getViewMode } from "@/lib/server/mode";
import { getSymbolDetail } from "@/lib/server/symbol";
import { getTrackedUniverse } from "@/lib/server/universe";

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

  const [detail, mode] = await Promise.all([
    getSymbolDetail(symbol, DEFAULT_RANGE),
    getViewMode(),
  ]);
  const { quote, available, news } = detail;

  // Ownership is mode-scoped (held/watched in the active book); the price/news
  // data itself is market data, the same in either view.
  const ownership = classifyOwnership(symbol, await getTrackedUniverse(mode));

  return (
    <SymbolResearchProvider symbol={symbol}>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-3">
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

          {/* Logo monogram + company name + SYMBOL · EXCHANGE · flag. The price
              and open/prev-close now live inside the chart card below. */}
          <SymbolCompanyHeader symbol={symbol} ownership={ownership} />
        </header>

        {/* Market & research data is sourced from Alpaca + Perplexity — the same
            regardless of the Paper/Live view. The Held/Watchlist badge above
            reflects the active book's tracked universe. */}
        <p className="text-xs text-fg-muted">
          Market &amp; research data — independent of the Paper/Live view (the
          Held/Watchlist tag reflects the {MODE_LABEL[mode]} book).
        </p>

        <DataSourceNotice notice={detail.notice} />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column — chart, stats, consensus, news, AI summary. */}
          <div className="flex min-w-0 flex-col gap-6">
            {available ? (
              <PriceChart
                symbol={symbol}
                initialPoints={detail.bars}
                initialRange={detail.range}
                quote={quote}
              />
            ) : null}

            <SymbolStatsGrid quote={quote} />

            <AnalystConsensus />

            {available ? (
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
            ) : null}

            <SymbolResearchSummary />
          </div>

          {/* Right rail — company profile + research links. */}
          <div className="flex flex-col gap-6">
            <CompanyProfileRail symbol={symbol} />

            <section aria-labelledby="links-heading">
              <h2
                id="links-heading"
                className="mb-1 text-sm font-semibold text-fg"
              >
                Research links
              </h2>
              <p className="mb-3 text-xs text-fg-muted">
                Deeper data and social sentiment we don&apos;t rebuild here.
              </p>
              <LinkOuts symbol={symbol} />
            </section>
          </div>
        </div>
      </div>
    </SymbolResearchProvider>
  );
}
