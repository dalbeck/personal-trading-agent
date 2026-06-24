import { PageTitle, Placeholder } from "@/components/page-shell";

export default function StrategyPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Strategy"
        subtitle="Charter and playbook — the rules the agent trades by."
      />
      <Placeholder note="Renders strategy/charter.md and strategy/playbook.md (editable) in M3." />
    </div>
  );
}
