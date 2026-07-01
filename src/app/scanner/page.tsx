import { ScannerView } from "@/components/scanner-view";
import { ViewingBadge } from "@/components/mode-scope";
import { Card, PageTitle } from "@/components/page-shell";
import { getViewMode } from "@/lib/server/mode";
import { isScannerEnabled } from "@/lib/server/scanner";
import { hasRobinhoodConnection } from "@/lib/server/robinhood";

export const dynamic = "force-dynamic";

/**
 * Market Scanner (scanner-discovery M1). A discovery funnel over the Robinhood
 * Agentic scanner tool: pick a preset (trend / value / earnings-soon) or set
 * custom RSI / volume / earnings filters, run a scan, and review ranked
 * candidates. From a result you can run the full analyze pipeline (→ proposal +
 * red-team) or add it to the tracked watchlist. It places nothing; prices are
 * indicative and every candidate is re-priced via Alpaca on analyze.
 */
export default async function ScannerPage() {
  const [mode, enabled, connected] = await Promise.all([
    getViewMode(),
    Promise.resolve(isScannerEnabled()),
    Promise.resolve(hasRobinhoodConnection()),
  ]);

  return (
    <div>
      <PageTitle
        title="Market Scanner"
        subtitle="Discovery funnel — surface candidates by trend, value, or upcoming earnings. It places nothing; candidates re-price via Alpaca on analyze."
      />
      <div className="mb-4 flex items-center gap-2">
        <ViewingBadge mode={mode} readOnly={false} />
        <span className="text-xs text-fg-muted">
          Candidates flow into the {mode} book on analyze
        </span>
      </div>

      {!enabled ? (
        <Card className="border-dashed">
          <h2 className="text-sm font-semibold text-fg">Scanner is off</h2>
          <p className="mt-1.5 text-pretty text-sm text-fg-muted">
            The market scanner ships disabled. Set{" "}
            <code className="rounded bg-surface-overlay px-1 py-0.5 text-xs">
              SCANNER_ENABLED=1
            </code>{" "}
            (and connect the Robinhood Agentic account via{" "}
            <code className="rounded bg-surface-overlay px-1 py-0.5 text-xs">
              ROBINHOOD_AGENTIC_ACCOUNT_NUMBER
            </code>
            ) in your environment, then restart the dashboard. It runs Robinhood&rsquo;s
            saved-scan tools read-only and places nothing.
          </p>
        </Card>
      ) : !connected ? (
        <Card className="border-dashed">
          <h2 className="text-sm font-semibold text-fg">
            No Robinhood account connected
          </h2>
          <p className="mt-1.5 text-pretty text-sm text-fg-muted">
            The scanner reads through the host CLI&rsquo;s authenticated Robinhood
            MCP session. Set{" "}
            <code className="rounded bg-surface-overlay px-1 py-0.5 text-xs">
              ROBINHOOD_AGENTIC_ACCOUNT_NUMBER
            </code>{" "}
            and connect the Agentic account first.
          </p>
        </Card>
      ) : (
        <ScannerView mode={mode} />
      )}
    </div>
  );
}
