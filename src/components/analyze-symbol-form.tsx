"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SLEEVE_LABEL, type Sleeve } from "@/lib/sleeves";

type Verdict = "approve" | "concern" | "reject";
interface LensOutcome {
  sleeve: Sleeve;
  verdict: Verdict | null;
}

type Outcome =
  | {
      ok: true;
      symbol: string;
      lenses: LensOutcome[];
      railsOk: boolean;
      railViolations: { rule: string; message: string }[];
      usedPerplexity: boolean;
    }
  | { ok: false; error: string };

const verdictTone: Record<Verdict, string> = {
  approve: "text-success",
  concern: "text-warning",
  reject: "text-danger",
};

/**
 * On-demand "Analyze a symbol" control. Enter a ticker and the desk runs the full
 * pipeline under **both** the trend and value mandates (dual-lens M1) — research
 * → proposal → risk rails → red-team for each lens — and queues **one** proposal
 * holding both breakdowns. It **places nothing**; a weak pick under both lenses
 * is flagged by the gates, never rubber-stamped. The book follows the view mode.
 */
export function AnalyzeSymbolForm({ mode }: { mode: "paper" | "live" }) {
  const router = useRouter();
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // "all" = evaluate ALL sleeves and show the verdict matrix (the default — a
  // manual analyze always shows the full picture, like the trend+value pair has
  // always done); "core-long" = a single target-weight core position where you
  // set the weight; "position-mid" = a single risk-to-stop mid position.
  const [sleeve, setSleeve] = useState<"all" | "core-long" | "position-mid">(
    "all",
  );
  const [targetWeight, setTargetWeight] = useState("10"); // percent

  const isCore = sleeve === "core-long";
  const isMid = sleeve === "position-mid";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ticker = symbol.trim().toUpperCase();
    if (!ticker || busy) return;
    const weightPct = Number(targetWeight) / 100;
    if (isCore && !(weightPct > 0)) {
      setOutcome({ ok: false, error: "Enter a target weight % for a core position." });
      return;
    }
    setBusy(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/proposals/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          isCore
            ? { symbol: ticker, sleeve: "core-long", targetWeightPct: weightPct }
            : isMid
              ? { symbol: ticker, sleeve: "position-mid" }
              : {
                  // Default: evaluate the swing pair PLUS position-mid + core-long
                  // — a manual analyze always shows every sleeve's verdict. The
                  // opt-in flags gate only autonomous discovery, not this.
                  symbol: ticker,
                  extraSleeves: ["position-mid", "core-long"],
                },
        ),
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
        <label className="min-w-[9rem]">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            Sleeve
          </span>
          <select
            value={sleeve}
            onChange={(e) =>
              setSleeve(e.target.value as "all" | "core-long" | "position-mid")
            }
            aria-label="Analyze under sleeve"
            className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="all">All sleeves</option>
            <option value="position-mid">Position (mid) only</option>
            <option value="core-long">Core (long) only</option>
          </select>
        </label>
        {isCore ? (
          <label className="min-w-[8rem]">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              Target weight %
            </span>
            <input
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
              inputMode="decimal"
              aria-label="Target portfolio weight percent"
              placeholder="10"
              className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
        ) : null}
        <Button type="submit" variant="primary" disabled={busy || !symbol.trim()}>
          {busy ? "Analyzing…" : "Analyze"}
        </Button>
      </form>

      <p className="mt-2 text-pretty text-xs text-fg-muted">
        Runs the full pipeline (research → proposal → risk rails → red-team)
        {isCore ? (
          <>
            {" "}under the{" "}
            <span className="font-medium text-fg">core-long lens</span> — a
            buy-and-hold position sized to your target weight, no stop (a
            drawdown/review trigger instead)
          </>
        ) : isMid ? (
          <>
            {" "}under the{" "}
            <span className="font-medium text-fg">position-mid lens</span> — a
            weeks-to-quarters trade that blends trend with a fundamental thesis,
            with a wider stop band
          </>
        ) : (
          <>
            {" "}under{" "}
            <span className="font-medium text-fg">every sleeve</span> — trend +
            value, position-mid, and core-long — shown as a per-sleeve verdict
            matrix on one proposal
          </>
        )}{" "}
        for the {mode} book and queues one candidate below. It places nothing; a
        weak pick is flagged, not rubber-stamped.
      </p>

      {outcome ? (
        outcome.ok ? (
          <div className="mt-3 rounded-card border border-line bg-surface-overlay p-3 text-sm">
            <p className="text-fg">
              <span className="font-semibold">{outcome.symbol}</span> analyzed
              and added below.{" "}
              {outcome.lenses.map((l, i) => (
                <span key={l.sleeve}>
                  {i > 0 ? " · " : ""}
                  {SLEEVE_LABEL[l.sleeve]}:{" "}
                  <span
                    className={l.verdict ? verdictTone[l.verdict] : "text-fg-muted"}
                  >
                    {l.verdict ?? "not run"}
                  </span>
                </span>
              ))}
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
