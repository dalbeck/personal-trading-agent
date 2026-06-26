"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, SectionTitle } from "@/components/page-shell";
import { CheckIcon } from "@/components/icons";
import type { ConvictionTier } from "@/lib/conviction";
import type { DiscoverySettings } from "@/lib/types";

/**
 * Discovery-funnel settings editor (Phase 3 M3). The human tunes how many ranked
 * candidates a discovery run surfaces and how the queue is filtered — **review
 * preferences, NOT safety rails.** The copy makes that boundary explicit: the
 * hard risk rails and the 6-order/day cap are configured elsewhere (and the cap
 * is fixed). Changes take effect on the next discovery run; the min-conviction
 * tier also sets the proposals queue's default filter. It opens no gate and
 * places no order.
 */

interface CharterDefaults {
  ideaCap: number;
  maxIdeaCap: number;
  maxProposalsPerSector: number;
  minSectorsTarget: number;
}

const TIERS: { value: ConvictionTier; label: string; help: string }[] = [
  { value: "watch", label: "Watch (show all)", help: "Surface every tier — the default." },
  { value: "moderate", label: "Moderate+", help: "Hide watch-tier ideas in the queue." },
  { value: "high", label: "High only", help: "Show only the strongest setups." },
];

export function DiscoverySettingsEditor({
  initial,
  charter,
}: {
  initial: DiscoverySettings;
  charter: CharterDefaults;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<DiscoverySettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function patch(p: Partial<DiscoverySettings>) {
    setSettings((s) => ({ ...s, ...p }));
    setSaved(false);
  }

  // An empty input means "use the charter default" → null.
  function numOrNull(raw: string): number | null {
    const n = Number(raw);
    return raw.trim() === "" || !Number.isFinite(n) ? null : Math.round(n);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/discovery-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ideaCap: settings.ideaCap,
          maxProposalsPerSector: settings.maxProposalsPerSector,
          minSectorsTarget: settings.minSectorsTarget,
          minConvictionTier: settings.minConvictionTier,
          valueSleeveEnabled: settings.valueSleeveEnabled,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { settings: DiscoverySettings };
        setSettings(data.settings);
        setSaved(true);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    patch({
      ideaCap: null,
      maxProposalsPerSector: null,
      minSectorsTarget: null,
      minConvictionTier: "watch",
      valueSleeveEnabled: false,
    });
  }

  return (
    <Card className="mt-6">
      <SectionTitle title="Discovery funnel" />
      <div className="mb-4 rounded-card border border-line bg-surface-overlay px-4 py-3 text-sm text-fg-muted">
        These are <span className="font-medium text-fg">review-funnel preferences</span>,
        not safety rails — they shape how many ranked candidates a discovery run
        surfaces and how the queue is filtered. The{" "}
        <span className="font-medium text-fg">hard risk rails</span> and the{" "}
        <span className="font-medium text-fg">6-order/day cap</span> are not here
        and are not tunable from this panel. Crank the funnel up for more
        opportunities; dial it down if the queue gets noisy.
      </div>

      <div className="flex flex-col gap-5">
        <NumberRail
          label="Idea cap (proposals per run)"
          help={`How many ranked candidates a run surfaces. Charter default ${charter.ideaCap}; max ${charter.maxIdeaCap}. Separate from — and larger than — the fixed 6-order/day cap.`}
          value={settings.ideaCap}
          placeholder={String(charter.ideaCap)}
          min={1}
          max={charter.maxIdeaCap}
          onChange={(raw) => patch({ ideaCap: numOrNull(raw) })}
        />
        <NumberRail
          label="Per-sector cap"
          help={`Most proposals from any single sector, so the queue stays a diversified mix. Charter default ${charter.maxProposalsPerSector}.`}
          value={settings.maxProposalsPerSector}
          placeholder={String(charter.maxProposalsPerSector)}
          min={1}
          max={charter.maxIdeaCap}
          onChange={(raw) => patch({ maxProposalsPerSector: numOrNull(raw) })}
        />
        <NumberRail
          label="Sector-spread target"
          help={`Aim to represent at least this many sectors when the setups exist. Charter default ${charter.minSectorsTarget}.`}
          value={settings.minSectorsTarget}
          placeholder={String(charter.minSectorsTarget)}
          min={0}
          max={11}
          onChange={(raw) => patch({ minSectorsTarget: numOrNull(raw) })}
        />

        <div>
          <p className="text-sm font-medium text-fg">Minimum conviction to surface</p>
          <p className="mb-2 text-xs text-fg-muted">
            The proposals queue&apos;s default filter. A view preference — it never
            deletes a proposal, just hides lower tiers until you change it.
          </p>
          <div
            className="inline-flex overflow-hidden rounded-pill border border-line"
            role="group"
            aria-label="Minimum conviction tier to surface"
          >
            {TIERS.map((t) => (
              <button
                key={t.value}
                type="button"
                title={t.help}
                aria-pressed={settings.minConvictionTier === t.value}
                onClick={() => patch({ minConvictionTier: t.value })}
                className={`px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                  settings.minConvictionTier === t.value
                    ? "bg-accent/15 text-fg"
                    : "text-fg-muted hover:bg-surface-overlay hover:text-fg"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-fg">Value / mean-reversion sleeve</p>
          <p className="mb-2 text-xs text-fg-muted">
            When on, a discovery run may also surface{" "}
            <span className="font-medium text-fg">value</span> candidates — cheap
            quality names near multi-year lows with a real catalyst or floor —
            separate from the trend universe and judged by the value red-team
            lens. Off by default; the desk&apos;s primary mandate is trend. A
            discovery preference, not a rail — value picks still clear the same
            shared hard rails and the 6-order/day cap.
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={settings.valueSleeveEnabled}
            onClick={() =>
              patch({ valueSleeveEnabled: !settings.valueSleeveEnabled })
            }
            className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
              settings.valueSleeveEnabled
                ? "border-accent bg-accent/15 text-fg"
                : "border-line text-fg-muted hover:bg-surface-overlay hover:text-fg"
            }`}
          >
            <span
              aria-hidden
              className={`size-2 rounded-pill ${
                settings.valueSleeveEnabled ? "bg-accent" : "bg-fg-muted/50"
              }`}
            />
            {settings.valueSleeveEnabled ? "Enabled" : "Disabled"}
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Button variant="primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save funnel settings"}
        </Button>
        <Button variant="secondary" onClick={reset} disabled={saving}>
          Reset to charter defaults
        </Button>
        {saved ? (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <CheckIcon className="size-4" aria-hidden /> Saved — applies next run
          </span>
        ) : null}
      </div>
    </Card>
  );
}

function NumberRail({
  label,
  help,
  value,
  placeholder,
  min,
  max,
  onChange,
}: {
  label: string;
  help: string;
  value: number | null;
  placeholder: string;
  min: number;
  max: number;
  onChange: (raw: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-fg">{label}</span>
      <p className="mb-1 text-xs text-fg-muted">{help}</p>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value ?? ""}
        placeholder={`${placeholder} (default)`}
        onChange={(e) => onChange(e.target.value)}
        className="w-32 rounded-input border border-line bg-surface px-3 py-2 text-sm tabular-nums text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </label>
  );
}
