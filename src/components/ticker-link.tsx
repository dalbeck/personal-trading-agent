import Link from "next/link";

/**
 * Clickable ticker → the `/symbol/[ticker]` detail view. Used anywhere a symbol
 * is shown (positions, proposals, news, journal). Renders a plain styled link;
 * safe in both server and client components. Keeps the symbol's own typography
 * (the caller sets weight/size) and only adds the affordance + hover state.
 */
export function TickerLink({
  symbol,
  className = "",
}: {
  symbol: string;
  className?: string;
}) {
  return (
    <Link
      href={`/symbol/${encodeURIComponent(symbol)}`}
      className={`rounded underline-offset-2 transition-colors hover:text-link hover:underline ${className}`}
      title={`Open ${symbol} detail`}
    >
      {symbol}
    </Link>
  );
}
