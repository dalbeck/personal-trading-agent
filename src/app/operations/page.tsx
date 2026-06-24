import { OpsPanel } from "@/components/ops-panel";
import { PageTitle } from "@/components/page-shell";

export const dynamic = "force-dynamic";

/**
 * Operations view — run the desk's allowlisted operational scripts from the
 * cockpit (preflight, routines, backups, schedule control, kill switch).
 *
 * The runner endpoint is fail-closed: with no `ROUTINE_TRIGGER_TOKEN` set it
 * refuses to run anything. We read that here (server-side) only to decide
 * whether to enable the panel — the token itself is never sent to the client;
 * the browser's same-origin request is its credential.
 */
export default function OperationsPage() {
  const enabled = Boolean(process.env.ROUTINE_TRIGGER_TOKEN);

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Operations"
        subtitle="Run the desk's operational scripts from the cockpit. Allowlisted, shell-free, paper-only — it can stop/kill but never open the live gate."
      />
      <OpsPanel enabled={enabled} />
    </div>
  );
}
