"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { STRATEGIES, STRATEGY_DESCRIPTION, type Strategy } from "@/lib/strategy";
import { strategyStyle } from "@/lib/strategy-style";

type Outcome =
  | {
      ok: true;
      symbol: string;
      strategy: Strategy;
      verdict: "approve" | "concern" | "reject";
      railsOk: boolean;
      railViolations: { rule: string; message: string }[];
      convictionTier: "high" | "moderate" | "watch" | null;
      usedPerplexity: boolean;
    }
  | { ok: false; error: string };

const verdictWord: Record<"approve" | "concern" | "reject", string> = {
  approve: "Red-team: approve",
  concern: "Red-team: concern",
  reject: "Red-team: reject",
};
const verdictTone: Record<"approve" | "concern" | "reject", string> = {
  approve: "text-success",
  concern: "text-warning",
  reject: "text-danger",
};

/**
 * On-demand "Analyze a symbol" control (M2). Enter a ticker and the desk runs
 * the full pipeline — research → proposal → risk rails → red-team — and queues
 * the result below for review. It **places nothing**; a weak pick is flagged by
 * the gates, never rubber-stamped. The book follows the current view mode.
 */
export function AnalyzeSymbolForm({ mode }: { mode: "paper" | "live" }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("trend");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ticker = symbol.trim().toUpperCase();
    if (!ticker || busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/proposals/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol: ticker, strategy }),
      });
      const data = (await res.json()) as Outcome & { error?: string };
      if (res.ok && data.ok) {
        setOutcome(data);
        setSymbol("");
        router.refresh(); // surface the new candidate in the list
      } else {
        setOutcome({ ok: false, error: data.error ?? "Analysis failed." });
      }
    } catch {
      setOutcome({ ok: false, error: "Network error — is the desk server running?" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[12rem]">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            Analyze a symbol
          </span>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="Ticker, e.g. NVDA"
            aria-label="Ticker to analyze"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm uppercase tracking-wide text-fg placeholder:normal-case placeholder:tracking-normal placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <Button type="submit" variant="primary" disabled={busy || !symbol.trim()}>
          {busy ? "Analyzing…" : "Analyze"}
        </Button>
      </form>

      {/* Lens picker (value-sleeve M1) — judge the ticker under the trend
          mandate or the separate value / mean-reversion mandate. */}
      <div className="mt-3">
        <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          Lens
        </span>
        <div
          className="mt-1 inline-flex overflow-hidden rounded-pill border border-line"
          role="group"
          aria-label="Strategy lens to analyze under"
        >
          {STRATEGIES.map((s) => (
            <button
              key={s}
              type="button"
              title={STRATEGY_DESCRIPTION[s]}
              aria-pressed={strategy === s}
              onClick={() => setStrategy(s)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                strategy === s
                  ? "bg-accent/15 text-fg"
                  : "text-fg-muted hover:bg-surface-overlay hover:text-fg"
              }`}
            >
              {strategyStyle[s].label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-pretty text-xs text-fg-muted">
          {STRATEGY_DESCRIPTION[strategy]}
        </p>
      </div>

      <p className="mt-2 text-pretty text-xs text-fg-muted">
        Runs the full pipeline (research → proposal → risk rails → red-team) for
        the {mode} book and queues the candidate below for review. It places
        nothing; a weak pick is flagged, not rubber-stamped.
      </p>

      {outcome ? (
        outcome.ok ? (
          <div className="mt-3 rounded-card border border-line bg-surface-overlay p-3 text-sm">
            <p className="text-fg">
              <span className="font-semibold">{outcome.symbol}</span> analyzed
              under the{" "}
              <span className="font-medium">
                {strategyStyle[outcome.strategy].label.toLowerCase()}
              </span>{" "}
              lens and added below
              {outcome.convictionTier ? ` · ${outcome.convictionTier} conviction` : ""}.{" "}
              <span className={verdictTone[outcome.verdict]}>
                {verdictWord[outcome.verdict]}
              </span>
              {" · "}
              <span className={outcome.railsOk ? "text-success" : "text-danger"}>
                {outcome.railsOk ? "rails clear" : "rails flagged"}
              </span>
              {outcome.usedPerplexity ? " · used Perplexity (capped)" : ""}.
            </p>
            {!outcome.railsOk && outcome.railViolations.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-danger">
                {outcome.railViolations.map((v) => (
                  <li key={v.rule}>
                    {v.rule} — {v.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 rounded-card border border-danger-border bg-danger-surface p-3 text-sm text-danger">
            {outcome.error}
          </p>
        )
      ) : null}
    </div>
  );
}
