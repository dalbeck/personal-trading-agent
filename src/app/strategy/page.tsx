import { StrategyEditor } from "@/components/strategy-editor";
import { PageTitle } from "@/components/page-shell";
import {
  STRATEGY_DOCS,
  STRATEGY_DOC_TITLES,
  readStrategyDoc,
} from "@/lib/server/strategy";

export const dynamic = "force-dynamic";

export default async function StrategyPage() {
  const docs = await Promise.all(
    STRATEGY_DOCS.map(async (doc) => ({
      doc,
      title: STRATEGY_DOC_TITLES[doc],
      content: await readStrategyDoc(doc),
    })),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Strategy"
        subtitle="The charter (immutable rules) and playbook (checklist + lessons)."
      />
      <StrategyEditor docs={docs} />
    </div>
  );
}
