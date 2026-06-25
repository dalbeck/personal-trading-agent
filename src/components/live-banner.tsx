import { getLiveTradingStatus } from "@/lib/server/gate";

/**
 * Unmistakable app-wide banner shown ONLY when live trading is armed (both gates
 * open, not disconnected). It makes the real-money state impossible to miss from
 * any page — a per-trade approval from here places a REAL order. When the gate is
 * closed (the shipped default) it renders nothing. Server component: reads the
 * gate directly. Rendering the banner changes no gate — it only reflects state.
 */
export async function LiveBanner() {
  const status = await getLiveTradingStatus();
  if (!status.liveEnabled) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 border-b border-danger-border bg-danger-surface px-4 py-2 text-center text-sm font-semibold text-danger"
    >
      <span
        aria-hidden
        className="size-2 rounded-pill bg-danger motion-safe:animate-pulse"
      />
      LIVE TRADING IS ON — approving a proposal places a REAL order with REAL
      money.
    </div>
  );
}
