import { ProposalsList } from "@/components/proposals-list";
import { Card, PageTitle } from "@/components/page-shell";
import { readProposals } from "@/lib/server/data";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const proposals = await readProposals();
  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Proposals"
        subtitle={`${pendingCount} pending · approvals are paper-only this phase`}
      />
      {proposals.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-fg-muted">No proposals.</p>
        </Card>
      ) : (
        <ProposalsList proposals={proposals} />
      )}
    </div>
  );
}
