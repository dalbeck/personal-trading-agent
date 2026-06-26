import { ArrowUpRightIcon } from "@/components/icons";

/**
 * External link-outs for a symbol — Yahoo (deep fundamentals), Robinhood
 * (retail view), Stocktwits (social sentiment). Built purely from the symbol,
 * opened in a new tab with `rel="noopener noreferrer"`. These are the graceful
 * fallback whenever live Alpaca data or the metered highlights are unavailable.
 */
const LINKS: { label: string; href: (s: string) => string; note: string }[] = [
  {
    label: "Yahoo Finance",
    href: (s) => `https://finance.yahoo.com/quote/${encodeURIComponent(s)}/`,
    note: "Fundamentals, financials, analyst views",
  },
  {
    label: "Robinhood",
    href: (s) =>
      `https://robinhood.com/us/en/stocks/${encodeURIComponent(s)}/`,
    note: "Retail quote & company overview",
  },
  {
    label: "Stocktwits",
    href: (s) => `https://stocktwits.com/symbol/${encodeURIComponent(s)}`,
    note: "Social sentiment & chatter",
  },
];

export function LinkOuts({ symbol }: { symbol: string }) {
  return (
    <ul className="grid gap-2">
      {LINKS.map((link) => (
        <li key={link.label}>
          <a
            href={link.href(symbol)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex h-full flex-col gap-1 rounded-card border border-line bg-surface-raised px-4 py-3 transition-colors hover:bg-surface-overlay"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              {link.label}
              <ArrowUpRightIcon className="size-3.5 text-fg-muted transition-colors group-hover:text-link" />
            </span>
            <span className="text-xs text-fg-muted">{link.note}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
