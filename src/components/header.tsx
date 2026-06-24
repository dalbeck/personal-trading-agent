import { LiveStatusControl } from "@/components/live-status";
import { MarketStatusPill } from "@/components/market-status-pill";
import { ThemeToggle } from "@/components/theme-toggle";
import { getLiveTradingStatus } from "@/lib/server/gate";
import { getMarketStatusSnapshot } from "@/lib/server/market";

/**
 * Top bar. Surfaces the active trading environment. PAPER is the proving ground
 * (accent-outlined); the LIVE chip reflects the real two-gate status (M2) and
 * carries a one-click disconnect. Paper vs. live must always read as distinct
 * (.agents/nextjs.md safety).
 */
export async function Header() {
  const [live, marketStatus] = await Promise.all([
    getLiveTradingStatus(),
    getMarketStatusSnapshot(),
  ]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 md:px-8">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-accent px-2.5 py-1 text-xs font-semibold text-fg">
          <span aria-hidden className="size-1.5 rounded-pill bg-accent" />
          PAPER
        </span>
        <LiveStatusControl
          status={{
            liveEnabled: live.liveEnabled,
            disconnected: live.disconnected,
            reason: live.reason,
          }}
        />
      </div>

      <div className="flex items-center gap-2">
        <MarketStatusPill initial={marketStatus} />
        <ThemeToggle />
      </div>
    </header>
  );
}
