import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProposalDetailView } from "@/components/proposal-detail-view";
import { SampleDataBanner } from "@/components/sample-data-badge";
import { readProposals } from "@/lib/server/data";
import { getLiveTradingStatus } from "@/lib/server/gate";

export const dynamic = "force-dynamic";

/**
 * Dedicated proposal detail page (`/proposals/[id]`) — the deep-linkable
 * full-context view that replaces the read-more modal. The slim proposals table
 * links here; this reads the one proposal by id and renders the spacious layout
 * (header + dual-lens-ready verdict summary/toggle, thesis, checklist, sizing,
 * research, red-team, gated actions). Read-only on load; the approve/reject flow
 * runs through the same gated endpoints as before.
 */

async function findProposal(id: string) {
  const all = await readProposals();
  return all.find((p) => p.id === id) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const proposal = await findProposal(id);
  if (!proposal) return { title: "Proposal not found" };
  return {
    title: `${proposal.action.toUpperCase()} ${proposal.symbol} — proposal`,
  };
}

export default async function ProposalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [proposal, { liveEnabled }] = await Promise.all([
    findProposal(id),
    getLiveTradingStatus(),
  ]);
  if (!proposal) notFound();

  return (
    <div>
      <SampleDataBanner show={proposal.sample} />
      <ProposalDetailView proposal={proposal} liveEnabled={liveEnabled} />
    </div>
  );
}
