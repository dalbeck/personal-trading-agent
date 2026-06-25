import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildReadiness, type ReadinessItem } from "@/lib/go-live";
import { readLatestSnapshot } from "./data";
import { getLiveTradingStatus } from "./gate";
import { hasRobinhoodConnection } from "./robinhood";

/** True when either settings file still references the stale `mcp__robinhood__*`
 *  order-tool ids (the real server is `robinhood-trading`). Best-effort read. */
async function hasStaleToolIds(): Promise<boolean> {
  const cwd = process.cwd();
  const files = [
    path.join(cwd, ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.local.json"),
  ];
  for (const f of files) {
    try {
      const raw = await readFile(f, "utf8");
      if (/mcp__robinhood__(place_equity_order|cancel_equity_order)/.test(raw)) {
        return true;
      }
    } catch {
      /* missing/unreadable settings file — ignore */
    }
  }
  return false;
}

export interface GoLiveReadiness {
  /** The aggregate gate result. */
  liveEnabled: boolean;
  /** Human-readable explanation of the current gate state. */
  reason: string;
  items: ReadinessItem[];
}

/**
 * Assemble the go-live readiness checklist from the live gate status, the
 * Robinhood connection, the live snapshot, and a scan of the settings files.
 * Read-only — it reports status and never opens a gate.
 */
export async function getGoLiveReadiness(): Promise<GoLiveReadiness> {
  const [status, liveSnap, staleToolIds] = await Promise.all([
    getLiveTradingStatus(),
    readLatestSnapshot("live"),
    hasStaleToolIds(),
  ]);
  const funded =
    (liveSnap?.equity ?? 0) > 0 ||
    Number(process.env.LIVE_FUNDED_CAPITAL_USD ?? 0) > 0;

  const items = buildReadiness({
    connected: hasRobinhoodConnection(),
    brokerGateOpen: status.brokerGateOpen,
    harnessGateOpen: status.harnessGateOpen,
    disconnected: status.disconnected,
    liveEnabled: status.liveEnabled,
    staleToolIds,
    funded,
  });

  return { liveEnabled: status.liveEnabled, reason: status.reason, items };
}
