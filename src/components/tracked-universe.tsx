import { Card } from "@/components/page-shell";
import { TickerLink } from "@/components/ticker-link";
import { WatchlistEditor } from "@/components/watchlist-editor";
import { MODE_LABEL, type ViewMode } from "@/lib/mode";
import type { TrackedUniverse } from "@/lib/universe";

/**
 * The tracked universe at a glance: the active book's holdings (auto-tracked,
 * read-only) plus the editable manual watchlist. Together they are what the
 * news scout watches and the research routine scans. Holdings auto-surface
 * here just by being owned; the watchlist is the human's manual additions.
 */
export function TrackedUniverseCard({
  universe,
  mode,
}: {
  universe: TrackedUniverse;
  mode: ViewMode;
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-fg">Tracked universe</h2>
        <span className="text-xs text-fg-muted">
          feeds the news scout &amp; research routine
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Held · {MODE_LABEL[mode]} (auto-tracked)
          </p>
          {universe.holdings.length === 0 ? (
            <p className="text-sm text-fg-muted">
              No {mode} holdings — owned symbols appear here automatically.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {universe.holdings.map((s) => (
                <li key={s}>
                  <TickerLink
                    symbol={s}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-accent px-2.5 py-1 text-xs font-medium text-fg"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Watchlist (manual)
          </p>
          <WatchlistEditor symbols={universe.watchlist} />
        </div>
      </div>
    </Card>
  );
}
