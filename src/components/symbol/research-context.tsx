"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  earnings: [],
  catalysts: [],
  cashFlow: null,
  cashFlowSource: null,
  dividend: null,
  dividendSource: null,
  finance: [],
  sections: [],
  categories: [],
  sources: [],
  usedAt: null,
  cost: null,
  robinhoodConnected: false,
  perplexity: "unavailable",
  perplexityReason: null,
  cached: false,
  fetchedAt: null,
};

const ResearchContext = createContext<ResearchState>({ status: "loading" });

/** Manual-refresh controls, kept in a separate context so the data islands
 *  (stats grid, profile, consensus) don't re-render on `refreshing` toggles. */
export interface ResearchControls {
  /** Force a refetch (re-spends Robinhood + a metered Perplexity call). */
  refresh: () => void;
  /** True while a manual refresh is in flight. */
  refreshing: boolean;
}

const ResearchControlsContext = createContext<ResearchControls>({
  refresh: () => {},
  refreshing: false,
});

export function useSymbolResearch(): ResearchState {
  return useContext(ResearchContext);
}

export function useResearchRefresh(): ResearchControls {
  return useContext(ResearchControlsContext);
}

export function SymbolResearchProvider({
  symbol,
  children,
}: {
  symbol: string;
  children: ReactNode;
}) {
  const [state, setState] = useState<ResearchState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  // Guards against a double-tap kicking off two concurrent refetches.
  const inFlight = useRef(false);

  // Auto-load once on mount (cache-first); the manual Refresh below force-refetches.
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

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/symbol/${encodeURIComponent(symbol)}/research/refresh`,
          { method: "POST" },
        );
        const data = (await res.json()) as SymbolResearch;
        if (data && typeof data === "object" && "perplexity" in data) {
          setState({ status: "loaded", research: data });
        }
      } catch {
        // Keep the existing data on a failed refresh — never blank the card.
      } finally {
        inFlight.current = false;
        setRefreshing(false);
      }
    })();
  }, [symbol]);

  return (
    <ResearchContext.Provider value={state}>
      <ResearchControlsContext.Provider value={{ refresh, refreshing }}>
        {children}
      </ResearchControlsContext.Provider>
    </ResearchContext.Provider>
  );
}

/**
 * Note explaining a Perplexity-sourced section that has no data, so the analyst
 * consensus + AI summary islands degrade consistently. Returns null when OK.
 */
export function perplexityNote(
  status: PerplexityStatus,
  reason?: string | null,
): string | null {
  switch (status) {
    case "off":
      return "AI research is off (a metered Perplexity add-on, off by default) — see the research links below.";
    case "capped":
      return "Today’s research limit was reached (the daily cap keeps cost bounded) — see the research links below.";
    case "unavailable":
      return reason
        ? `Research unavailable — ${reason}. See the research links below.`
        : "Research is unavailable right now — see the research links below.";
    default:
      return null;
  }
}
