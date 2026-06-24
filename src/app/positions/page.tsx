import { PageTitle, Placeholder } from "@/components/page-shell";

export default function PositionsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Positions"
        subtitle="Open positions with cost basis and unrealized P&L."
      />
      <Placeholder note="Sortable positions table ships in M3, wired to paper data in M4." />
    </div>
  );
}
