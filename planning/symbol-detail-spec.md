# Build Spec — symbol detail view

_Executable spec for a local Claude Code session. Read `AGENTS.md`, `.agents/nextjs.md`, `.agents/infra.md`, `.agents/design-system.md` first. Two feature branches + PRs. No real-money paths._

## Source decision (recommended)
- **Alpaca** = chart + quote + news (already wired; primary, always-on). Bars for ranges, snapshot for price/stats, `/v1beta1/news` for headlines.
- **Perplexity `finance_search`** = on-demand "highlights" (fundamentals / earnings / analyst / catalysts), behind a button, **metered + capped + default-off** (reuse the existing provider).
- **Link-outs** = Yahoo / Robinhood / Stocktwits for deep fundamentals + social sentiment we won't rebuild.
- **NOT Robinhood MCP** (agent-mediated, requires the live connection, not a REST feed) and **NOT scraping Yahoo** (ToS/fragile).

## M1 — `feature/symbol-detail` — the view + Alpaca data + link-outs
- New route, e.g. `/symbol/[ticker]`, reachable by **clicking any ticker** across the app (proposals, positions, journal, news).
- **Chart:** Alpaca historical bars with range tabs (1D/1W/1M/3M/1Y); pick sensible timeframes per range (intraday minutes for 1D/1W, daily bars beyond). Server-side; keys never reach the client.
- **Quote stats:** Alpaca snapshot → price, change, open, day range, 52-wk range, volume. `tabular-nums`. Label the data source + "IEX" (free tier is IEX, not consolidated tape — be honest).
- **Recent news:** Alpaca news endpoint for the symbol (title, source, time, link — real links, open with `rel="noopener noreferrer"`).
- **Link-outs:** Yahoo (`finance.yahoo.com/quote/{sym}/`), Robinhood (`robinhood.com/us/en/stocks/{sym}/`), Stocktwits (`stocktwits.com/symbol/{sym}`), built from the symbol, external, new tab.
- **Graceful degradation:** with no Alpaca creds, show the link-outs + a clear "live data unavailable — connect Alpaca" state (consistent with the sample-data honesty principle); never fabricate a chart.
- **Acceptance:** clicking a ticker opens the view; chart ranges work from Alpaca; stats + news render with sources; link-outs correct; degrades cleanly without creds; light + dark + a11y (chart has an accessible label/summary).

## M2 — `feature/symbol-highlights` — on-demand Perplexity highlights
- A "Load highlights" button calls the existing capped `finance_search` provider for the symbol (valuation, earnings, analyst, catalysts), rendered via the safe markdown renderer.
- **User-initiated only** (one symbol, one click — bounded cost); counts against `PERPLEXITY_DAILY_CALL_CAP`. If `RESEARCH_PROVIDER=off` or the cap is hit, show the link-outs + a note instead, not an error.
- Clearly label the source + that it's metered.
- **Acceptance:** with the provider enabled + key, the button loads structured highlights and respects the daily cap (refuses past it gracefully); with the provider off, the view still works and points to the link-outs; no calls happen until the button is clicked.

## Out of scope
- Robinhood MCP / scraping as data sources; pre-market/after-hours chart sessions; real-money paths.
