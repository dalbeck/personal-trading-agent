import { ProposalsList } from "@/components/proposals-list";
import { Card, PageTitle } from "@/components/page-shell";
import { readProposals } from "@/lib/server/data";
import { getLiveTradingStatus } from "@/lib/server/gate";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const proposals = await readProposals();
  const { liveEnabled } = await getLiveTradingStatus();
  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  return (
    <div>
      <PageTitle
        title="Proposals"
        subtitle={`${pendingCount} pending · ${
          liveEnabled
            ? "LIVE — approvals place real orders"
            : "approvals route to the dry-run sink (paper / mock)"
        }`}
      />
      {proposals.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-fg-muted">No proposals.</p>
        </Card>
      ) : (
        <ProposalsList proposals={proposals} liveEnabled={liveEnabled} />
      )}
    </div>
  );
}
