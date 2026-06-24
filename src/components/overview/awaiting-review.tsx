import { ModuleCard, ModuleEmpty } from "@/components/overview/module-card";
import { ProposalsList } from "@/components/proposals-list";
import type { TradeProposal } from "@/lib/types";

/**
 * Awaiting review — the top pending proposals with approve/reject wired
 * through the EXISTING approval flow (`ProposalsList` → `/api/live/approve`,
 * AlertDialog confirm, paper/dry-run semantics). No new execution path is
 * introduced here; this is the same component the Proposals page renders,
 * scoped to the top few and surfaced on the Overview.
 */
export function AwaitingReview({
  proposals,
  liveEnabled,
  pendingTotal,
}: {
  proposals: TradeProposal[];
  liveEnabled: boolean;
  pendingTotal: number;
}) {
  const more = pendingTotal - proposals.length;

  return (
    <ModuleCard
      title="Awaiting review"
      subtitle={
        pendingTotal > 0
          ? `${pendingTotal} pending · approvals route to the ${
              liveEnabled ? "LIVE broker" : "dry-run sink (paper / mock)"
            }`
          : "Proposals you approve or reject"
      }
      href="/proposals"
      hrefLabel="All proposals"
    >
      {proposals.length === 0 ? (
        <ModuleEmpty
          message="No proposals awaiting review — the desk is all caught up."
          cta={{ href: "/operations", label: "Run a routine from Operations" }}
        />
      ) : (
        <>
          <ProposalsList proposals={proposals} liveEnabled={liveEnabled} />
          {more > 0 ? (
            <p className="mt-3 text-xs text-fg-muted">
              + {more} more pending on the Proposals page.
            </p>
          ) : null}
        </>
      )}
    </ModuleCard>
  );
}
