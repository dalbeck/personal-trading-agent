import { PageTitle, Placeholder } from "@/components/page-shell";

export default function LogsPage() {
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Logs" subtitle="Recent run logs." />
      <Placeholder note="Recent run-log rendering ships in M3." />
    </div>
  );
}
