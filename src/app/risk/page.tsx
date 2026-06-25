import type { Metadata } from "next";
import { RISK_LIMITS } from "@strategy/charter.config";
import { PageTitle } from "@/components/page-shell";
import { RiskSettingsEditor } from "@/components/risk-settings-editor";
import { readRiskSettings } from "@/lib/server/risk-settings";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Risk settings · Trading Cockpit" };

/**
 * Risk settings — the human's standing overrides of the charter risk rails.
 * Read-only resolver + a client editor; the charter constants remain the safe
 * defaults and these overrides layer in at per-trade approval time. This page
 * configures policy only — it opens no gate and places no order.
 */
export default async function RiskSettingsPage() {
  const settings = await readRiskSettings();

  return (
    <div>
      <PageTitle
        title="Risk settings"
        subtitle="Adjust or disable each risk rail on your own account. The charter defaults are safe; overrides apply at per-trade approval and every change is recorded. A rail can also be overridden per-trade in the approve dialog."
      />

      <div className="mb-4 rounded-card border border-line bg-surface-overlay px-4 py-3 text-sm text-fg-muted">
        These settings govern the <span className="font-medium text-fg">per-trade approval</span> gate. They never open the live-trading gate or place an order — the two human gates stay separate and are the only real-money boundary.
      </div>

      <RiskSettingsEditor
        initial={settings}
        charter={{
          perPositionSizePct: RISK_LIMITS.perPositionSizePct,
          maxOrdersPerDay: RISK_LIMITS.maxOrdersPerDay,
          drawdownHaltPct: RISK_LIMITS.drawdownHaltPct,
        }}
      />
    </div>
  );
}
