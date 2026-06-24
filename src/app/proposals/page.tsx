import { PageTitle, Placeholder } from "@/components/page-shell";

export default function ProposalsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Proposals"
        subtitle="Pending agent ideas awaiting approve / reject."
      />
      <Placeholder note="Proposal cards with paper-only approve/reject ship in M3 (no real-money path)." />
    </div>
  );
}
