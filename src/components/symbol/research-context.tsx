"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type {
  PerplexityStatus,
  SymbolResearch,
} from "@/lib/server/research/types";

/**
 * Auto-loads the merged symbol research once when a symbol page mounts and
 * shares it with every Perplexity-/Robinhood-sourced island (stats grid, profile
 * rail, analyst consensus, AI summary). Sourcing is cheapest-first server-side:
 * Robinhood fundamentals (free, read-only) preferred, Perplexity as the metered
 * auto-fallback that also supplies consensus + the AI narrative. The result is
 * cached per-symbol-per-day server-side, so a refresh or navigate-back never
 * re-spends; off/capped degrade to "—" + the research link-outs.
 */

export type ResearchState =
  | { status: "loading" }
  | { status: "loaded"; research: SymbolResearch };

const FALLBACK: SymbolResearch = {
  fundamentals: null,
  fundamentalsSource: null,
  profile: null,
  profileSource: null,
  consensus: null,
  summary: "",
  finance: [],
  categories: [],
  sources: [],
  usedAt: null,
  cost: null,
  robinhoodConnected: false,
  perplexity: "unavailable",
  cached: false,
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
        const data = (await res.json()) as SymbolResearch;
        if (cancelled) return;
        setState({
          status: "loaded",
          research:
            data && typeof data === "object" && "perplexity" in data
              ? data
              : FALLBACK,
        });
      } catch {
        if (!cancelled) setState({ status: "loaded", research: FALLBACK });
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
 * Note explaining a Perplexity-sourced section that has no data, so the analyst
 * consensus + AI summary islands degrade consistently. Returns null when OK.
 */
export function perplexityNote(status: PerplexityStatus): string | null {
  switch (status) {
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
