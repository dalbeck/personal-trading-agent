"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/page-shell";
import {
  PRESET_DESCRIPTION,
  PRESET_LABEL,
  SCAN_PRESETS,
  emptyFilters,
  filtersForPreset,
  type ScanFilters,
  type ScanPreset,
  type ScanResult,
} from "@/lib/scanner";

/** Per-row action state so each candidate shows its own progress/result. */
type RowState = {
  analyzing?: boolean;
  adding?: boolean;
  note?: string;
  noteTone?: "ok" | "error";
};

function fmtNum(v: number | null, digits = 2): string {
  return v === null ? "—" : v.toFixed(digits);
}

function fmtCompact(v: number | null): string {
  if (v === null) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString();
}

/**
 * The interactive scanner. Pick a preset (or Custom), tune filters, run a scan,
 * and act on each result: Analyze (full pipeline → proposal + red-team) or Add
 * to the tracked watchlist. Prices shown are indicative discovery metadata —
 * sizing/pricing happens via Alpaca in the analyze pipeline.
 */
export function ScannerView({ mode }: { mode: "paper" | "live" }) {
  const router = useRouter();
  const [preset, setPreset] = useState<ScanPreset>("trend");
  const [filters, setFilters] = useState<ScanFilters>(filtersForPreset("trend"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanResult[] | null>(null);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});

  function choosePreset(p: ScanPreset) {
    setPreset(p);
    setFilters(p === "custom" ? emptyFilters() : filtersForPreset(p));
  }

  function setFilter<K extends keyof ScanFilters>(key: K, value: ScanFilters[K]) {
    // Editing any filter implies a custom scan.
    setFilters((f) => ({ ...f, [key]: value }));
    setPreset("custom");
  }

  /** Parse a number input → number | null (blank = no filter). */
  function numOrNull(raw: string): number | null {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  async function runScan() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setResults(null);
    setRowState({});
    try {
      const res = await fetch("/api/scanner/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset, filters }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        results?: ScanResult[];
        error?: string;
      };
      if (res.ok && data.ok) {
        setResults(data.results ?? []);
      } else {
        setError(data.error ?? "Scan failed.");
      }
    } catch {
      setError("Network error — is the desk server running?");
    } finally {
      setBusy(false);
    }
  }

  function patchRow(symbol: string, patch: RowState) {
    setRowState((s) => ({ ...s, [symbol]: { ...s[symbol], ...patch } }));
  }

  async function analyze(symbol: string) {
    patchRow(symbol, { analyzing: true, note: undefined });
    try {
      const res = await fetch("/api/proposals/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, extraSleeves: ["position-mid", "core-long"] }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        patchRow(symbol, { analyzing: false, note: "queued", noteTone: "ok" });
        router.refresh();
      } else {
        patchRow(symbol, {
          analyzing: false,
          note: data.error ?? "failed",
          noteTone: "error",
        });
      }
    } catch {
      patchRow(symbol, { analyzing: false, note: "network error", noteTone: "error" });
    }
  }

  async function addToWatchlist(symbol: string) {
    patchRow(symbol, { adding: true, note: undefined });
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", symbol }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        patchRow(symbol, { adding: false, note: "on watchlist", noteTone: "ok" });
      } else {
        patchRow(symbol, {
          adding: false,
          note: data.error ?? "failed",
          noteTone: "error",
        });
      }
    } catch {
      patchRow(symbol, { adding: false, note: "network error", noteTone: "error" });
    }
  }

  function exportJson() {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scan-${preset}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {SCAN_PRESETS.map((p) => {
            const active = preset === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => choosePreset(p)}
                aria-pressed={active}
                className={[
                  "rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors duration-150",
                  active
                    ? "border-accent bg-accent/10 text-fg"
                    : "border-line text-fg-muted hover:bg-surface-overlay hover:text-fg",
                ].join(" ")}
              >
                {PRESET_LABEL[p]}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-pretty text-xs text-fg-muted">
          {PRESET_DESCRIPTION[preset]}
        </p>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[6rem]">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              RSI min
            </span>
            <input
              inputMode="decimal"
              value={filters.rsiMin ?? ""}
              onChange={(e) => setFilter("rsiMin", numOrNull(e.target.value))}
              placeholder="—"
              aria-label="RSI minimum"
              className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="min-w-[6rem]">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              RSI max
            </span>
            <input
              inputMode="decimal"
              value={filters.rsiMax ?? ""}
              onChange={(e) => setFilter("rsiMax", numOrNull(e.target.value))}
              placeholder="—"
              aria-label="RSI maximum"
              className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="min-w-[8rem]">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              Min rel. volume
            </span>
            <input
              inputMode="decimal"
              value={filters.minRelativeVolume ?? ""}
              onChange={(e) =>
                setFilter("minRelativeVolume", numOrNull(e.target.value))
              }
              placeholder="—"
              aria-label="Minimum relative volume"
              className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="min-w-[9rem]">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              Earnings ≤ days
            </span>
            <input
              inputMode="numeric"
              value={filters.earningsWithinDays ?? ""}
              onChange={(e) =>
                setFilter("earningsWithinDays", numOrNull(e.target.value))
              }
              placeholder="—"
              aria-label="Earnings within days"
              className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="min-w-[5rem]">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              Limit
            </span>
            <input
              inputMode="numeric"
              value={filters.limit}
              onChange={(e) =>
                setFilter("limit", numOrNull(e.target.value) ?? filters.limit)
              }
              aria-label="Result limit"
              className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <label className="min-w-[8rem]">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              Min mkt cap ($B)
            </span>
            <input
              inputMode="decimal"
              value={
                filters.minMarketCap === null ? "" : filters.minMarketCap / 1e9
              }
              onChange={(e) => {
                const n = numOrNull(e.target.value);
                setFilter("minMarketCap", n === null ? null : n * 1e9);
              }}
              placeholder="—"
              aria-label="Minimum market cap in billions of dollars"
              className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          <Button variant="primary" disabled={busy} onClick={runScan}>
            {busy ? "Scanning…" : "Run scan"}
          </Button>
        </div>
      </Card>

      {error ? (
        <p className="rounded-card border border-danger-border bg-danger-surface p-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {results ? (
        results.length === 0 ? (
          <Card className="border-dashed">
            <p className="text-sm text-fg-muted">
              No matches. Loosen the filters or try a different preset.
            </p>
          </Card>
        ) : (
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <span className="text-sm font-medium text-fg">
                {results.length} candidate{results.length === 1 ? "" : "s"}
              </span>
              <Button variant="ghost" size="sm" onClick={exportJson}>
                Export JSON
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-muted">
                    <th className="px-5 py-2.5 font-medium">Symbol</th>
                    <th className="px-3 py-2.5 font-medium">Sector</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Price<span className="font-normal lowercase"> (ind.)</span>
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">RSI</th>
                    <th className="px-3 py-2.5 text-right font-medium">Rel vol</th>
                    <th className="px-3 py-2.5 text-right font-medium">Mkt cap</th>
                    <th className="px-3 py-2.5 font-medium">Earnings</th>
                    <th className="px-5 py-2.5 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const st = rowState[r.symbol] ?? {};
                    return (
                      <tr
                        key={r.symbol}
                        className="border-b border-line/60 last:border-0"
                      >
                        <td className="px-5 py-2.5 font-semibold text-fg">
                          {r.symbol}
                        </td>
                        <td className="px-3 py-2.5 text-fg-muted">
                          {r.sector ?? "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-fg">
                          {fmtNum(r.price)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-fg">
                          {fmtNum(r.rsi, 0)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-fg">
                          {r.relativeVolume === null
                            ? "—"
                            : `${r.relativeVolume.toFixed(2)}×`}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-fg">
                          {fmtCompact(r.marketCap)}
                        </td>
                        <td className="px-3 py-2.5 text-fg-muted">
                          {r.earningsDate ?? "—"}
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            {st.note ? (
                              <span
                                className={`text-xs ${
                                  st.noteTone === "error"
                                    ? "text-danger"
                                    : "text-success"
                                }`}
                              >
                                {st.note}
                              </span>
                            ) : null}
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={st.adding}
                              onClick={() => addToWatchlist(r.symbol)}
                            >
                              {st.adding ? "Adding…" : "Add"}
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={st.analyzing}
                              onClick={() => analyze(r.symbol)}
                            >
                              {st.analyzing ? "Analyzing…" : "Analyze"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-line px-5 py-2.5 text-xs text-fg-muted">
              Prices are indicative scanner metadata — candidates re-price via
              Alpaca on analyze. Analyze queues a {mode}-book proposal through the
              risk rails + red-team; it places nothing.
            </p>
          </Card>
        )
      ) : null}
    </div>
  );
}
