"use client";

import { ResearchSummaryCard } from "@/components/symbol/research-summary-card";
import {
  useResearchRefresh,
  useSymbolResearch,
} from "@/components/symbol/research-context";
import type { SymbolQuote } from "@/lib/symbol";

/**
 * Symbol-page highlights island. Reads the auto-loaded, merged symbol research
 * from context and renders the shared, scannable {@link ResearchSummaryCard}.
 * The card itself is presentational/reusable; this thin wrapper just wires the
 * loading/loaded context state (and the Alpaca quote for the price chip) into it.
 */
export function SymbolResearchSummary({ quote }: { quote: SymbolQuote | null }) {
  const state = useSymbolResearch();
  const { refresh, refreshing } = useResearchRefresh();
  const research = state.status === "loaded" ? state.research : null;
  return (
    <ResearchSummaryCard
      research={research}
      quote={quote}
      loading={state.status === "loading"}
      onRefresh={refresh}
      refreshing={refreshing}
    />
  );
}
