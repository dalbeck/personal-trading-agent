import "server-only";

import {
  getAlpacaPaperSnapshot,
  hasAlpacaCredentials,
} from "@/lib/server/alpaca";
import { readLatestSnapshot } from "@/lib/server/data";
import {
  getRobinhoodLiveSnapshot,
  hasRobinhoodConnection,
  type PortfolioFetcher,
} from "@/lib/server/robinhood";
import { enrichLivePositions, type SnapshotGetter } from "@/lib/server/live-price";
import { enforceLiveDrawdownKill } from "@/lib/server/live-guards";
import { recordSnapshot } from "@/lib/server/writers";
import type { PortfolioSnapshot } from "@/lib/types";

export type AccountSource = "alpaca" | "seed";

export type PaperAccount = {
  snapshot: PortfolioSnapshot | null;
  source: AccountSource;
  /** Non-null when sample data is shown instead of live paper data. */
  notice: string | null;
};

export type LiveSource = "robinhood" | "seed" | "disconnected";

export type LiveAccount = {
  snapshot: PortfolioSnapshot | null;
  source: LiveSource;
  /** True only when a real Robinhood Agentic connection is configured. */
  connected: boolean;
  /** Non-null when the panel is not showing a fresh live snapshot. */
  notice: string | null;
};

/**
 * Resolves the paper account for the dashboard. Prefers the live Alpaca paper
 * API when credentials are present; otherwise — or if the API call fails — it
 * falls back to the local seed snapshot so the app always renders.
 */
export async function getPaperAccount(): Promise<PaperAccount> {
  if (hasAlpacaCredentials()) {
    try {
      const snapshot = await getAlpacaPaperSnapshot();
      return { snapshot, source: "alpaca", notice: null };
    } catch (err) {
      const snapshot = await readLatestSnapshot("paper");
      return {
        snapshot,
        source: "seed",
        notice: `Alpaca paper API unavailable (${
          (err as Error).message
        }) — showing sample data.`,
      };
    }
  }

  const snapshot = await readLatestSnapshot("paper");
  return {
    snapshot,
    source: "seed",
    notice: "No Alpaca paper keys set — showing sample data.",
  };
}

const DISCONNECTED: LiveAccount = {
  snapshot: null,
  source: "disconnected",
  connected: false,
  notice:
    "Robinhood Agentic account not connected — live trading is off. " +
    "Connecting and funding are deliberate human actions, gated on a passing Phase 2 scorecard.",
};

/**
 * Resolves the **live** Robinhood Agentic account for the dashboard LIVE panel
 * (read-only). This renders from the **last persisted live snapshot** so the
 * page paints instantly — it does NOT spawn the `claude` CLI on every render
 * (that read takes tens of seconds; doing it per page load is what made the
 * LIVE pages slow and littered `data/snapshots/`). The fresh read happens
 * out-of-band via {@link refreshLiveAccount} (the Refresh button / a routine).
 *
 * When no account is configured — the shipped default — it returns a clear
 * `disconnected` state so the panel renders LIVE TRADING: OFF.
 *
 * This path is read-only: it can never place an order.
 */
export async function getLiveAccount(): Promise<LiveAccount> {
  if (!hasRobinhoodConnection()) return DISCONNECTED;

  const snapshot = await readLatestSnapshot("live");
  if (!snapshot) {
    return {
      snapshot: null,
      source: "robinhood",
      connected: true,
      notice:
        "Connected — no live snapshot yet. Use Refresh to pull the account.",
    };
  }
  return { snapshot, source: "robinhood", connected: true, notice: null };
}

/**
 * Fetch a **fresh** read-only snapshot of the live Agentic account: read it via
 * the `claude` CLI (`get_portfolio` / `get_equity_positions`), enrich each
 * position with the current Alpaca price (market value + unrealized P&L —
 * Robinhood's position data carries no live mark), persist it, run the live
 * drawdown kill switch, and return it. This is the only path that spawns the
 * CLI; the page render reads what this persists. Falls back to the last saved
 * snapshot (with a notice) if the read fails.
 *
 * Read-only: it can never place an order. `fetcher`/`getSnapshot` are injectable
 * for tests so this runs without a CLI, a network, or a live account.
 */
export async function refreshLiveAccount(opts?: {
  fetcher?: PortfolioFetcher;
  getSnapshot?: SnapshotGetter;
  dataDir?: string;
}): Promise<LiveAccount> {
  if (!opts?.fetcher && !hasRobinhoodConnection()) return DISCONNECTED;

  try {
    const raw = await getRobinhoodLiveSnapshot({ fetcher: opts?.fetcher });
    const snapshot = await enrichLivePositions(raw, {
      getSnapshot: opts?.getSnapshot,
    }).catch(() => raw); // enrichment is best-effort; never sink the read on it
    // Persist so the LIVE panel and the agent read one shared source of truth.
    await recordSnapshot(snapshot, { dataDir: opts?.dataDir }).catch(() => {
      /* persistence is best-effort; never sink the live read on a write error */
    });
    // Live drawdown kill switch (M4): a fresh live read past the threshold
    // latches live OFF and alerts. Fail-soft — never sink the read.
    const kill = await enforceLiveDrawdownKill(snapshot, {
      dataDir: opts?.dataDir,
    }).catch(() => null);
    const notice = kill?.halted
      ? `Live drawdown −${(kill.drawdownPct * 100).toFixed(1)}% tripped the kill switch — live trading halted.`
      : null;
    return { snapshot, source: "robinhood", connected: true, notice };
  } catch (err) {
    const snapshot = await readLatestSnapshot("live");
    return {
      snapshot,
      source: "seed",
      connected: true,
      notice: `Robinhood live read unavailable (${
        (err as Error).message
      })${snapshot ? " — showing the last saved live snapshot." : "."}`,
    };
  }
}
