import { LiveStatusControl } from "@/components/live-status";
import { MarketStatusPill } from "@/components/market-status-pill";
import { ModeToggle } from "@/components/mode-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { getLiveTradingStatus } from "@/lib/server/gate";
import { getMarketStatusSnapshot } from "@/lib/server/market";
import { getViewMode } from "@/lib/server/mode";

/**
 * Top bar. The Paper | Live toggle picks which **book** the panels display — a
 * view switch, not an engine switch (both desks run; toggling never arms
 * trading). The LIVE TRADING chip beside it reflects the real two-gate order
 * status and carries a one-click disconnect — kept separate so the view mode is
 * never mistaken for the execution gate. Paper vs. live must always read as
 * distinct (.agents/nextjs.md safety).
 */
export async function Header() {
  const [mode, live, marketStatus] = await Promise.all([
    getViewMode(),
    getLiveTradingStatus(),
    getMarketStatusSnapshot(),
  ]);

  // Name the *other* book so the toggle makes clear both run concurrently.
  const otherBookHint =
    mode === "live" ? "Paper sink active" : "Live account active";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 md:px-8">
      <div className="flex items-center gap-2">
        <ModeToggle mode={mode} />
        <span className="hidden text-xs text-fg-muted lg:inline">
          · {otherBookHint}
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
