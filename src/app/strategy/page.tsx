import { StrategyEditor } from "@/components/strategy-editor";
import { StrategyIntro } from "@/components/strategy/strategy-intro";
import { PageTitle } from "@/components/page-shell";
import { listStrategyDocs, readStrategyDoc } from "@/lib/server/strategy";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const docs = await Promise.all(
    listStrategyDocs().map(async (meta) => ({
      ...meta,
      content: await readStrategyDoc(meta.doc),
    })),
  );

  return (
    <div>
      <PageTitle
        title="Strategy"
        subtitle="The charters (immutable per-sleeve mandates), the shared safety envelope, and the playbook (checklist + lessons)."
      />
      <StrategyIntro />
      <StrategyEditor docs={docs} />
    </div>
  );
}
