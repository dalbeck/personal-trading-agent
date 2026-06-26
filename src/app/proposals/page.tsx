import { AnalyzeSymbolForm } from "@/components/analyze-symbol-form";
import { ViewingBadge } from "@/components/mode-scope";
import { ProposalsList } from "@/components/proposals-list";
import { Card, PageTitle } from "@/components/page-shell";
import { RunHint } from "@/components/run-hint";
import { SampleDataBanner } from "@/components/sample-data-badge";
import { anySample } from "@/lib/sample-data";
import { readProposals } from "@/lib/server/data";
import { getLiveTradingStatus } from "@/lib/server/gate";
import { getViewMode } from "@/lib/server/mode";

export const dynamic = "force-dynamic";

export default async function ProposalsPage() {
  const [all, { liveEnabled }, mode] = await Promise.all([
    readProposals(),
    getLiveTradingStatus(),
    getViewMode(),
  ]);
  const isLive = mode === "live";
  // Each proposal is tagged with its account (default paper). The view mode
  // scopes the list to the active book; live proposals are advisory-only and
  // carry no execution path (the ProposalsList renders them as such).
  const proposals = all.filter((p) => p.account === mode);
  const pendingCount = proposals.filter((p) => p.status === "pending").length;

  return (
    <div>
      <PageTitle
        title="Proposals"
        subtitle={
          isLive
            ? `${pendingCount} pending · live — you approve each order before anything is placed (gate closed → dry-run). No automated execution.`
            : `${pendingCount} pending · ${
                liveEnabled
                  ? "LIVE — approvals place real orders"
                  : "approvals route to the dry-run sink (paper / mock)"
              }`
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <ViewingBadge mode={mode} readOnly={false} />
        <span className="text-xs text-fg-muted">
          {isLive
            ? "Proposals for the live account — approve to place"
            : "Proposals for the paper desk"}
        </span>
      </div>
      <div className="mb-4">
        <AnalyzeSymbolForm mode={mode} />
      </div>
      <SampleDataBanner show={anySample(proposals)} />
      {proposals.length === 0 ? (
        <Card className="border-dashed">
          <p className="text-sm text-fg-muted">
            {isLive ? "No live advisory proposals." : "No paper proposals."}
          </p>
          <RunHint
            message="Proposals appear after a discovery run — the desk hasn't run it yet."
            href="/routines"
            cta="Run Pre-market research →"
          />
        </Card>
      ) : (
        <ProposalsList proposals={proposals} liveEnabled={liveEnabled} />
      )}
    </div>
  );
}
