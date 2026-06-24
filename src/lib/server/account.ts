import "server-only";

import {
  getAlpacaPaperSnapshot,
  hasAlpacaCredentials,
} from "@/lib/server/alpaca";
import { readLatestSnapshot } from "@/lib/server/data";
import type { PortfolioSnapshot } from "@/lib/types";

export type AccountSource = "alpaca" | "seed";

export type PaperAccount = {
  snapshot: PortfolioSnapshot | null;
  source: AccountSource;
  /** Non-null when sample data is shown instead of live paper data. */
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
