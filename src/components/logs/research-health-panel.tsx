import "server-only";
import {
  researchReasonText,
  type ResearchDiagnostic,
} from "@/lib/server/research/diagnostics";

/** One-line summary of a research call for the health panel. Pure (tested). */
export function formatDiagnosticLine(d: ResearchDiagnostic): string {
  const reason = researchReasonText(d);
  const cost = d.cost != null ? ` · $${d.cost.toFixed(4)}` : "";
  return `${d.symbol} · ${reason ?? "ok"} · ${d.latencyMs}ms${cost}`;
}

/**
 * Research-provider health (research-observability M1). The last research calls'
 * outcome / reason / latency / cost, so a silent failure (the LLY cash-flow
 * fetch) is visible at a glance instead of an invisible `null`.
 */
export function ResearchHealthPanel({
  diagnostics,
}: {
  diagnostics: ResearchDiagnostic[];
}) {
  if (diagnostics.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-surface-raised p-6">
        <p className="text-sm text-fg-muted">No research calls recorded yet.</p>
      </div>
    );
  }
  const [latest, ...rest] = diagnostics;
  const ok = latest.outcome === "ok";
  return (
    <section className="rounded-card border border-line bg-surface-raised p-5">
      <h2 className="text-sm font-semibold text-fg">Research provider health</h2>
      <p className="mt-1 text-xs text-fg-subtle">
        Last research call and recent history (Perplexity finance_search).
      </p>
      <p
        className={`mt-3 text-sm font-medium ${ok ? "text-fg" : "text-warning"}`}
      >
        Last call: {formatDiagnosticLine(latest)}
      </p>
      {rest.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-fg-muted">
          {rest.map((d, i) => (
            <li key={`${d.at}-${i}`} className="tabular-nums">
              {formatDiagnosticLine(d)}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
