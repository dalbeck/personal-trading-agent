"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { RiskRailSetting, RiskSettings } from "@/lib/types";

/**
 * Risk-settings editor (Phase 3 M7). The human can adjust or disable each rail;
 * the charter `RISK_LIMITS` stay the safe defaults and these only ever override
 * them, layered in at per-trade approval time. Disabling a rail is explicit
 * (a visible OFF state + warning) and logged (persisted with a timestamp). A
 * rail can still be overridden per-trade in the approve dialog; this page sets
 * the standing policy. It changes no gate and places no order.
 */

type NumericKey = "positionSize" | "dailyOrderCap" | "drawdownHalt";
type ToggleKey = "stopRequired" | "universe";
type RailKey = NumericKey | ToggleKey;

interface NumericRail {
  key: NumericKey;
  label: string;
  help: string;
  unit: "pct" | "count";
  charter: number; // charter default, in storage units (fraction or integer)
}

interface ToggleRail {
  key: ToggleKey;
  label: string;
  help: string;
}

export function RiskSettingsEditor({
  initial,
  charter,
}: {
  initial: RiskSettings;
  charter: { perPositionSizePct: number; maxOrdersPerDay: number; drawdownHaltPct: number };
}) {
  const router = useRouter();
  const [settings, setSettings] = useState<RiskSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const numericRails: NumericRail[] = [
    {
      key: "positionSize",
      label: "Per-position size cap",
      help: "Most of your equity allowed in any single name on an entry.",
      unit: "pct",
      charter: charter.perPositionSizePct,
    },
    {
      key: "dailyOrderCap",
      label: "Daily order cap",
      help: "Most orders the desk may place in one day.",
      unit: "count",
      charter: charter.maxOrdersPerDay,
    },
    {
      key: "drawdownHalt",
      label: "Drawdown halt",
      help: "Block new buys once equity falls this far below its high-water mark.",
      unit: "pct",
      charter: charter.drawdownHaltPct,
    },
  ];

  const toggleRails: ToggleRail[] = [
    {
      key: "stopRequired",
      label: "Require a protective stop",
      help: "Every entry must carry a stop in the right direction.",
    },
    {
      key: "universe",
      label: "Universe rule",
      help: "Listed US equities only; the benchmark (SPY) is never a holding.",
    },
  ];

  function setRail(key: RailKey, next: RiskRailSetting) {
    setSettings((s) => ({ ...s, [key]: next }));
    setSaved(false);
  }

  // Storage units → friendly input units (fraction → percent number).
  const toDisplay = (unit: "pct" | "count", v: number) =>
    unit === "pct" ? Math.round(v * 1000) / 10 : v;
  const fromDisplay = (unit: "pct" | "count", v: number) =>
    unit === "pct" ? v / 100 : Math.round(v);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/risk-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  function resetToCharter() {
    setSettings({
      positionSize: { enabled: true, value: null },
      dailyOrderCap: { enabled: true, value: null },
      drawdownHalt: { enabled: true, value: null },
      stopRequired: { enabled: true, value: null },
      universe: { enabled: true, value: null },
      updatedAt: settings.updatedAt,
    });
    setSaved(false);
  }

  const anyDisabled = (
    ["positionSize", "dailyOrderCap", "drawdownHalt", "stopRequired", "universe"] as RailKey[]
  ).some((k) => !settings[k].enabled);

  return (
    <div className="flex flex-col gap-4">
      {numericRails.map((rail) => {
        const setting = settings[rail.key];
        const charterDisplay =
          rail.unit === "pct" ? `${toDisplay("pct", rail.charter)}%` : `${rail.charter}`;
        return (
          <div
            key={rail.key}
            className="rounded-card border border-line bg-surface-raised p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-fg">{rail.label}</h3>
                <p className="mt-0.5 text-pretty text-xs text-fg-muted">
                  {rail.help} Charter default:{" "}
                  <span className="font-medium text-fg">{charterDisplay}</span>.
                </p>
              </div>
              <RailToggle
                enabled={setting.enabled}
                onChange={(enabled) =>
                  setRail(rail.key, { ...setting, enabled })
                }
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <label className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Value
              </label>
              <input
                type="number"
                inputMode="decimal"
                step={rail.unit === "pct" ? 0.5 : 1}
                min={0}
                disabled={!setting.enabled}
                value={
                  setting.value !== null
                    ? toDisplay(rail.unit, setting.value)
                    : ""
                }
                placeholder={charterDisplay.replace("%", "")}
                onChange={(e) =>
                  setRail(rail.key, {
                    ...setting,
                    value:
                      e.target.value === ""
                        ? null
                        : fromDisplay(rail.unit, Number(e.target.value)),
                  })
                }
                className="w-28 rounded-card border border-line bg-surface px-3 py-1.5 text-sm tabular-nums text-fg disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {rail.unit === "pct" ? (
                <span className="text-sm text-fg-muted">%</span>
              ) : null}
              <span className="text-xs text-fg-muted">
                (blank = charter default)
              </span>
            </div>

            {!setting.enabled ? (
              <p className="mt-3 rounded-card border border-warning-border bg-warning-surface px-3 py-2 text-xs font-medium text-warning">
                This rail is OFF — approvals won&apos;t be checked against it.
              </p>
            ) : null}
          </div>
        );
      })}

      {toggleRails.map((rail) => {
        const setting = settings[rail.key];
        return (
          <div
            key={rail.key}
            className="rounded-card border border-line bg-surface-raised p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-fg">{rail.label}</h3>
                <p className="mt-0.5 text-pretty text-xs text-fg-muted">
                  {rail.help}
                </p>
              </div>
              <RailToggle
                enabled={setting.enabled}
                onChange={(enabled) =>
                  setRail(rail.key, { ...setting, enabled })
                }
              />
            </div>
            {!setting.enabled ? (
              <p className="mt-3 rounded-card border border-warning-border bg-warning-surface px-3 py-2 text-xs font-medium text-warning">
                This rail is OFF — approvals won&apos;t be checked against it.
              </p>
            ) : null}
          </div>
        );
      })}

      {anyDisabled ? (
        <p className="text-pretty text-xs text-warning">
          One or more rails are disabled. Defaults are safe — re-enable any rail,
          or reset to the charter defaults, whenever you want the guardrail back.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {saved ? (
          <span className="mr-auto text-sm text-success">Saved.</span>
        ) : null}
        <Button variant="secondary" size="sm" onClick={resetToCharter}>
          Reset to charter defaults
        </Button>
        <Button variant="primary" size="sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save risk settings"}
        </Button>
      </div>
    </div>
  );
}

function RailToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-accent"
      />
      <span className={enabled ? "text-fg" : "text-fg-muted"}>
        {enabled ? "Enabled" : "Disabled"}
      </span>
    </label>
  );
}
