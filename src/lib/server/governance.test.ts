import { describe, expect, it } from "vitest";
import { getGovernanceScorecard } from "./governance";
import type { JournalEntry, TradeProposal } from "@/lib/types";

/**
 * The governance scorecard grades the PAPER desk's gate. It must not be
 * contaminated by live activity (approved live trades, live proposal verdicts) —
 * that is the "no paper/live bleed" invariant. These tests drive the account
 * scoping in the server wrapper via its injectable readers.
 */

const trade = (account: "paper" | "live"): JournalEntry =>
  ({ kind: "trade", account, tags: [] }) as unknown as JournalEntry;

const rejection = (
  account: "paper" | "live",
  rejectedBy: "codex-redteam" | "rules" | "human",
): JournalEntry =>
  ({ kind: "rejection", account, rejectedBy, tags: [] }) as unknown as JournalEntry;

const proposal = (
  account: "paper" | "live",
  verdict: "approve" | "reject" | "concern",
): TradeProposal =>
  ({ account, redTeam: { verdict } }) as unknown as TradeProposal;

describe("getGovernanceScorecard account scoping", () => {
  it("counts only PAPER journal + proposals by default — no live bleed", async () => {
    const sc = await getGovernanceScorecard({
      readJournalImpl: async () => [
        trade("paper"),
        trade("live"), // human-approved live trade — must NOT count
        rejection("paper", "rules"),
        rejection("live", "human"), // live rejection — must NOT count
      ],
      readProposalsImpl: async () => [
        proposal("paper", "approve"),
        proposal("live", "reject"), // live verdict — must NOT count
      ],
    });

    expect(sc.tradesPlaced).toBe(1);
    expect(sc.rejections.total).toBe(1);
    expect(sc.rejections.byActor.rules).toBe(1);
    expect(sc.rejections.byActor.human).toBe(0);
    expect(sc.judged).toBe(1);
    expect(sc.redTeam.approve).toBe(1);
    expect(sc.redTeam.reject).toBe(0);
  });

  it("can scope to the LIVE book when asked", async () => {
    const sc = await getGovernanceScorecard({
      account: "live",
      readJournalImpl: async () => [
        trade("paper"),
        trade("live"),
        rejection("live", "human"),
      ],
      readProposalsImpl: async () => [
        proposal("paper", "approve"),
        proposal("live", "reject"),
      ],
    });

    expect(sc.tradesPlaced).toBe(1);
    expect(sc.rejections.byActor.human).toBe(1);
    expect(sc.redTeam.reject).toBe(1);
    expect(sc.redTeam.approve).toBe(0);
  });
});
