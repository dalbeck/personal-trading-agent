import { PageTitle, Placeholder } from "@/components/page-shell";

export default function RoutinesPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Routines"
        subtitle="Scheduled jobs with last-run status and a health indicator."
      />
      <Placeholder note="Routine list, run-now (stubbed), and dead-man-switch indicator ship in M3." />
    </div>
  );
}
