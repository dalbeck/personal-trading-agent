"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionTitle } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { SLEEVES, SLEEVE_LABEL } from "@/lib/sleeves";
import type { AllocationTargets } from "@/lib/types";

/**
 * Human-set target allocation editor (portfolio M5). The human owns the mix — the
 * agent reads it and proposes against it but never writes it. Posts to
 * `/api/allocation-targets`; the schema rejects duplicate sleeves and a mix
 * summing over 100%.
 */
export function AllocationTargetsEditor({ targets }: { targets: AllocationTargets }) {
  const router = useRouter();
  const initial: Record<string, string> = {};
  for (const s of SLEEVES) {
    const t = targets.targets.find((x) => x.sleeve === s);
    initial[s] = t ? String(Math.round(t.targetWeightPct * 100)) : "";
  }
  const [weights, setWeights] = useState<Record<string, string>>(initial);
  const [band, setBand] = useState(String(Math.round(targets.driftBandPct * 100)));
  const [benchmark, setBenchmark] = useState(targets.blendedBenchmark);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null,
  );

  const total = SLEEVES.reduce((sum, s) => sum + (Number(weights[s]) || 0), 0);

  async function save() {
    setSaving(true);
    setMessage(null);
    const payload = {
      targets: SLEEVES.flatMap((s) => {
        const v = Number(weights[s]);
        return v > 0 ? [{ sleeve: s, targetWeightPct: v / 100 }] : [];
      }),
      driftBandPct: (Number(band) || 0) / 100,
      blendedBenchmark: benchmark.trim() || "SPY total return",
    };
    try {
      const res = await fetch("/api/allocation-targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        setMessage({ tone: "ok", text: "Saved allocation targets." });
        router.refresh();
      } else {
        setMessage({ tone: "err", text: data.error ?? "Save failed." });
      }
    } catch {
      setMessage({ tone: "err", text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <SectionTitle title="Set target allocation" />
      <p className="mb-3 mt-1 text-sm text-fg-muted">
        Your target mix across sleeves (the remainder is cash). The agent proposes
        rebalances against this but never edits it.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SLEEVES.map((s) => (
          <label key={s} className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
              {SLEEVE_LABEL[s]} %
            </span>
            <input
              value={weights[s]}
              onChange={(e) => setWeights((w) => ({ ...w, [s]: e.target.value }))}
              inputMode="decimal"
              placeholder="0"
              aria-label={`${SLEEVE_LABEL[s]} target weight percent`}
              className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            Drift band %
          </span>
          <input
            value={band}
            onChange={(e) => setBand(e.target.value)}
            inputMode="decimal"
            aria-label="Drift band percent"
            className="mt-1 w-24 rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <label className="block flex-1 min-w-[12rem]">
          <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
            Blended benchmark
          </span>
          <input
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
            aria-label="Blended benchmark"
            className="mt-1 w-full rounded-input border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <span
          className={`text-sm tabular-nums ${total > 100 ? "text-loss" : "text-fg-muted"}`}
        >
          Total: {total}% {total > 100 ? "(over 100%)" : ""}
        </span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={saving || total > 100}>
          {saving ? "Saving…" : "Save targets"}
        </Button>
        {message ? (
          <span
            role="status"
            className={`text-sm ${message.tone === "ok" ? "text-gain" : "text-loss"}`}
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
