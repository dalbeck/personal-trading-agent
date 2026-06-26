import type { Metadata } from "next";
import { DISCOVERY_LIMITS, RISK_LIMITS } from "@strategy/charter.config";
import { PageTitle } from "@/components/page-shell";
import { DiscoverySettingsEditor } from "@/components/discovery-settings-editor";
import { RiskSettingsEditor } from "@/components/risk-settings-editor";
import { RiskStanceHero } from "@/components/risk/risk-stance-hero";
import { readDiscoverySettings } from "@/lib/server/discovery-settings";
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
  const [settings, discoverySettings] = await Promise.all([
    readRiskSettings(),
    readDiscoverySettings(),
  ]);
  const charter = {
    perPositionSizePct: RISK_LIMITS.perPositionSizePct,
    maxOrdersPerDay: RISK_LIMITS.maxOrdersPerDay,
    drawdownHaltPct: RISK_LIMITS.drawdownHaltPct,
  };
  const discoveryCharter = {
    ideaCap: DISCOVERY_LIMITS.ideaCap,
    maxIdeaCap: DISCOVERY_LIMITS.maxIdeaCap,
    maxProposalsPerSector: DISCOVERY_LIMITS.maxProposalsPerSector,
    minSectorsTarget: DISCOVERY_LIMITS.minSectorsTarget,
  };

  return (
    <div>
      <PageTitle
        title="Risk settings"
        subtitle="Adjust or disable each risk rail on your own account. The charter defaults are safe; overrides apply at per-trade approval and every change is recorded. A rail can also be overridden per-trade in the approve dialog."
      />

      <RiskStanceHero settings={settings} charter={charter} />

      <div className="mb-4 rounded-card border border-line bg-surface-overlay px-4 py-3 text-sm text-fg-muted">
        These settings govern the <span className="font-medium text-fg">per-trade approval</span> gate. They never open the live-trading gate or place an order — the two human gates stay separate and are the only real-money boundary.
      </div>

      <RiskSettingsEditor initial={settings} charter={charter} />

      <DiscoverySettingsEditor
        initial={discoverySettings}
        charter={discoveryCharter}
      />
    </div>
  );
}
