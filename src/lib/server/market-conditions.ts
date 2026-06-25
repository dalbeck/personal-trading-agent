import "server-only";

import { getStockSnapshot, hasAlpacaCredentials } from "./alpaca";

/**
 * Live market conditions for the charter **emergency-stop** rail (SPY −2%
 * intraday OR VIX > 30), read at decision time so the rail fires on the real
 * tape rather than a placeholder.
 *
 * - **SPY intraday change** comes from Alpaca — the desk's single source of
 *   truth for prices (`.agents/infra.md`) — as `(last − prevClose) / prevClose`.
 *   This works on the free IEX feed.
 * - **VIX** has no reliable free Alpaca feed (the IEX/SIP stock endpoints return
 *   "asset not found" for `^VIX`), so it is sourced through an **injectable**
 *   `vix` seam and defaults to a neutral level when no source is wired. The SPY
 *   arm — the dominant broad-market-stress signal, and the one Alpaca serves
 *   reliably — is always live.
 *
 * Best-effort and **fail-soft**: any fetch error or missing data degrades to the
 * neutral reading (`spyIntradayChangePct: 0`, `vix: 15`) so the order path never
 * crashes on a market-data hiccup. The neutral reading does NOT trip the rail —
 * a transient data failure must not silently block every order — so when SPY/VIX
 * data is unavailable the emergency stop simply does not fire.
 */

export interface MarketConditions {
  /** SPY intraday change as a fraction: -0.025 === SPY −2.5%. */
  spyIntradayChangePct: number;
  vix: number;
}

/** The neutral reading used when a source is unavailable — trips no rail. */
export const NEUTRAL_MARKET: MarketConditions = {
  spyIntradayChangePct: 0,
  vix: 15,
};

/** SPY snapshot getter seam (defaults to Alpaca's IEX snapshot). */
export type SpyChangeGetter = () => Promise<number | null>;
/** VIX level getter seam (no reliable free Alpaca feed — injected/neutral). */
export type VixGetter = () => Promise<number | null>;

/** SPY intraday change as a fraction from the Alpaca snapshot, or null. */
async function alpacaSpyChange(
  fetchImpl?: typeof fetch,
): Promise<number | null> {
  const snap = await getStockSnapshot("SPY", { fetchImpl });
  const last = snap.latestTrade?.p ?? snap.dailyBar?.c ?? null;
  const prevClose = snap.prevDailyBar?.c ?? null;
  if (last == null || prevClose == null || prevClose === 0) return null;
  return (last - prevClose) / prevClose;
}

/**
 * Resolve live market conditions for the emergency-stop rail. Injectable seams
 * (`spyChange`, `vix`, `fetchImpl`) keep it unit-testable offline; the real
 * defaults read Alpaca for SPY and leave VIX neutral unless a source is wired.
 */
export async function getMarketConditions(opts?: {
  spyChange?: SpyChangeGetter;
  vix?: VixGetter;
  fetchImpl?: typeof fetch;
}): Promise<MarketConditions> {
  const spyChange =
    opts?.spyChange ??
    (hasAlpacaCredentials() || opts?.fetchImpl
      ? () => alpacaSpyChange(opts?.fetchImpl)
      : null);
  const vixGetter = opts?.vix ?? null;

  let spyIntradayChangePct = NEUTRAL_MARKET.spyIntradayChangePct;
  if (spyChange) {
    try {
      const v = await spyChange();
      if (v != null && Number.isFinite(v)) spyIntradayChangePct = v;
    } catch {
      /* fail-soft → neutral */
    }
  }

  let vix = NEUTRAL_MARKET.vix;
  if (vixGetter) {
    try {
      const v = await vixGetter();
      if (v != null && Number.isFinite(v) && v > 0) vix = v;
    } catch {
      /* fail-soft → neutral */
    }
  }

  return { spyIntradayChangePct, vix };
}
