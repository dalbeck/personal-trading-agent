import "server-only";

import { readJournal, readLatestSnapshot } from "./data";
import {
  nearLongTermSellNote,
  washSaleWarning,
  type WashSaleEntry,
  type WashSaleWarning,
} from "@/lib/tax";
import type { TradeProposal } from "@/lib/types";

/**
 * Tax advisory for a proposal (tax-awareness M6) — a wash-sale warning and a
 * "nearly long-term" sell note. **Advisory only**: surfaced cautions, never a
 * block, and no lot selection. Computed from the trade journal + the matched
 * snapshot lot for the proposal's account. Returns nulls when nothing applies.
 */
export interface TaxAdvisory {
  washSale: WashSaleWarning | null;
  nearLongTerm: string | null;
}

export async function getTaxAdvisory(
  proposal: Pick<TradeProposal, "symbol" | "action" | "limitPrice" | "account">,
): Promise<TaxAdvisory> {
  const account = proposal.account ?? "paper";
  const [journal, snapshot] = await Promise.all([
    readJournal(),
    readLatestSnapshot(account),
  ]);
  const asOf = snapshot?.asOf ?? new Date().toISOString();
  const lot = snapshot?.positions.find((p) => p.symbol === proposal.symbol) ?? null;

  const journalEntries: WashSaleEntry[] = journal
    .filter((e) => e.kind === "trade" && e.account === account)
    .map((e) => ({
      symbol: e.symbol,
      action: (e as { action: "buy" | "sell" }).action,
      timestamp: e.timestamp,
    }));

  // A sell realizes a loss when the limit is below the lot's average cost.
  const realizesLoss =
    proposal.action === "sell" && lot != null && proposal.limitPrice < lot.avgCost;

  const washSale = washSaleWarning({
    symbol: proposal.symbol,
    action: proposal.action,
    realizesLoss,
    asOf,
    journal: journalEntries,
  });

  // A sell at a gain on a nearly-long-term lot would lock in a short-term gain.
  const nearLongTerm =
    proposal.action === "sell" && lot != null && lot.openedAt
      ? nearLongTermSellNote({
          openedAt: lot.openedAt,
          asOf,
          hasGain: proposal.limitPrice >= lot.avgCost,
        })
      : null;

  return { washSale, nearLongTerm };
}
