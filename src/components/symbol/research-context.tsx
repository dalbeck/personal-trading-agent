"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ResearchResult } from "@/lib/server/research/types";

/**
 * Auto-loads the capped Perplexity `finance_search` highlights once when a
 * symbol page mounts, and shares the result with every Perplexity-sourced
 * island (stats grid, profile rail, analyst consensus, AI summary) so the
 * single metered call fans out to all of them. The in-code daily cap (enforced
 * server-side in the provider) is the cost guard; when the provider is off or
 * the cap is hit, consumers fall back to "—" and the research link-outs.
 */

export type ResearchState =
  | { status: "loading" }
  | { status: "off" }
  | { status: "capped" }
  | { status: "unavailable" }
  | { status: "loaded"; result: ResearchResult };

type HighlightsResponse = {
  off?: boolean;
  capped?: boolean;
  result?: ResearchResult | null;
};

const ResearchContext = createContext<ResearchState>({ status: "loading" });

export function useSymbolResearch(): ResearchState {
  return useContext(ResearchContext);
}

export function SymbolResearchProvider({
  symbol,
  children,
}: {
  symbol: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<ResearchState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    // All state writes happen after an await so this never trips the
    // set-state-in-effect lint rule (see `.agents/nextjs.md`).
    (async () => {
      try {
        const res = await fetch(
          `/api/symbol/${encodeURIComponent(symbol)}/highlights`,
          { method: "POST" },
        );
        const data = (await res.json()) as HighlightsResponse;
        if (cancelled) return;
        if (data.result) setState({ status: "loaded", result: data.result });
        else if (data.off) setState({ status: "off" });
        else if (data.capped) setState({ status: "capped" });
        else setState({ status: "unavailable" });
      } catch {
        if (!cancelled) setState({ status: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <ResearchContext.Provider value={state}>
      {children}
    </ResearchContext.Provider>
  );
}

/**
 * Shared note for the off / capped / unavailable states, so each Perplexity
 * island can explain the "—" cells consistently and point at the link-outs.
 * Returns null while loading or once loaded.
 */
export function researchNote(state: ResearchState): string | null {
  switch (state.status) {
    case "off":
      return "AI research is off (a metered Perplexity add-on, off by default) — see the research links below.";
    case "capped":
      return "Today’s research limit was reached (the daily cap keeps cost bounded) — see the research links below.";
    case "unavailable":
      return "Research is unavailable right now — see the research links below.";
    default:
      return null;
  }
}
