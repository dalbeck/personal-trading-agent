import { DataSourceNotice } from "@/components/data-source-notice";
import { HeroCard, HeroMetric, HeroStat } from "@/components/hero-card";
import { KpiCard } from "@/components/overview/kpi-card";
import { LiveRefreshButton } from "@/components/live-refresh-button";
import { ViewingBadge } from "@/components/mode-scope";
import { PositionsTable } from "@/components/positions-table";
import { HoldingsMixCard } from "@/components/positions/holdings-mix-card";
import { Card, PageTitle } from "@/components/page-shell";
import { RiskPostureCard } from "@/components/risk-posture-card";
import {
  BanknotesIcon,
  PositionsIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from "@/components/icons";
import { formatCurrency, formatPercent, toneForValue } from "@/lib/format";
import { MODE_LABEL, otherMode } from "@/lib/mode";
import { getLiveAccount, getPaperAccount } from "@/lib/server/account";
import { getViewMode } from "@/lib/server/mode";
import { getEffectiveRiskConfig } from "@/lib/server/risk-settings";
import { riskPostureFromSnapshot } from "@/lib/risk-posture";
import type { Position } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  // Both books resolve independently (both engines run); the view mode only
  // picks which one is the primary section. Paper = Alpaca/seed; live =
  // Robinhood Agentic, read-only.
  const [paper, live, mode, riskConfig] = await Promise.all([
    getPaperAccount(),
    getLiveAccount(),
    getViewMode(),
    getEffectiveRiskConfig(),
  ]);
  const isLive = mode === "live";
  const otherLabel = MODE_LABEL[otherMode(mode)];
  const activeSnap = isLive ? live.snapshot : paper.snapshot;
  const activePositions = activeSnap?.positions ?? [];
  const otherPositions =
    (isLive ? paper.snapshot : live.snapshot)?.positions ?? [];
  // Presentation aggregates only — sums over the already-fetched positions,
  // mirroring the existing totalMarketValue/totalUnrealized math.
  const totalMarketValue = activePositions.reduce(
    (s, p) => s + p.marketValue,
    0,
  );
  const totalUnrealized = activePositions.reduce(
    (s, p) => s + p.unrealizedPl,
    0,
  );
  const totalCostBasis = activePositions.reduce((s, p) => s + p.costBasis, 0);
  // Unrealized P&L as a percent of cost basis, for the KPI delta.
  const unrealizedPct = totalCostBasis > 0 ? totalUnrealized / totalCostBasis : 0;
  const unrealizedTone = toneForValue(totalUnrealized);
  const posture = activeSnap
    ? riskPostureFromSnapshot(activeSnap, {
        railsLoosened: riskConfig.skipRules.length > 0,
      })
    : null;

  // The active book's branch-specific header strip (badge + title + source
  // meta + the live refresh / privacy plumbing). Kept intact across the
  // composition rework; only the surrounding layout changed.
  const activeHeader = isLive ? (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <ViewingBadge mode="live" />
        <h2
          className={`font-serif text-[0.95rem] font-semibold ${
            live.connected ? "text-fg" : "text-fg-muted"
          }`}
        >
          Live account
        </h2>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-fg-muted">
            Robinhood Agentic · read-only
          </span>
          {live.connected ? (
            <LiveRefreshButton asOf={live.snapshot?.asOf} />
          ) : null}
        </div>
      </div>
      {/* Privacy: the Robinhood MCP can read every linked account, but the
          desk surfaces ONLY the Agentic account — it never enumerates or
          displays the others. */}
      <p className="text-xs text-fg-muted">
        Agentic account only — other Robinhood accounts are never read.
      </p>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <ViewingBadge mode="paper" />
      <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
        Paper account
      </h2>
      <span className="ml-auto text-xs text-fg-muted">
        {paper.source === "alpaca" ? "Live · Alpaca" : "Sample data"}
      </span>
    </div>
  );

  // The active book's notice + table (or its dashed empty/not-connected state).
  const activeBody =
    isLive && !live.connected ? (
      <Card className="border-dashed">
        <p className="text-pretty text-sm text-fg-muted">
          {live.notice ??
            "Robinhood Agentic account not connected — live trading is off."}
        </p>
      </Card>
    ) : (
      <>
        <DataSourceNotice notice={isLive ? live.notice : paper.notice} />
        <PositionsSection
          positions={activePositions}
          asOf={activeSnap?.asOf ?? null}
          emptyLabel={
            isLive ? "No open live positions." : "No open paper positions."
          }
        />
      </>
    );

  return (
    <div className="space-y-8">
      <PageTitle
        title="Positions"
        subtitle={
          isLive
            ? "Open positions in the live Robinhood Agentic account — read-only."
            : "Open positions in the paper account, with cost basis and unrealized P&L."
        }
      />

      {activePositions.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
          {/* MAIN — focal hero → enriched KPI row → the active book table. */}
          <div className="flex flex-col gap-6">
            <HeroCard surface="surface-hero-accent">
              <div className="mb-6 flex items-center gap-2">
                <ViewingBadge mode={mode} />
                <h2 className="font-serif text-[0.95rem] font-semibold text-fg">
                  {isLive ? "Live positions" : "Paper positions"}
                </h2>
                <span className="ml-auto text-xs text-fg-muted">
                  {activePositions.length} open
                </span>
              </div>
              <div className="grid gap-6 lg:grid-cols-[1.05fr_1.5fr] lg:items-center">
                <HeroMetric
                  label="Market value"
                  value={formatCurrency(totalMarketValue)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <HeroStat
                    label="Unrealized P&L"
                    value={formatCurrency(totalUnrealized, { signed: true })}
                    tone={unrealizedTone}
                    icon={
                      unrealizedTone === "loss"
                        ? TrendingDownIcon
                        : TrendingUpIcon
                    }
                  />
                  <HeroStat
                    label="Open positions"
                    value={String(activePositions.length)}
                  />
                </div>
              </div>
            </HeroCard>

            <div className="grid grid-cols-2 gap-4">
              <KpiCard
                label="Market value"
                value={formatCurrency(totalMarketValue)}
                icon={WalletIcon}
              />
              <KpiCard
                label="Unrealized P&L"
                value={formatCurrency(totalUnrealized, { signed: true })}
                icon={unrealizedTone === "loss" ? TrendingDownIcon : TrendingUpIcon}
                tone={unrealizedTone}
                delta={totalCostBasis > 0 ? formatPercent(unrealizedPct) : undefined}
                deltaTone={unrealizedTone}
              />
              <KpiCard
                label="Cost basis"
                value={formatCurrency(totalCostBasis)}
                icon={BanknotesIcon}
              />
              <KpiCard
                label="Positions"
                value={String(activePositions.length)}
                icon={PositionsIcon}
              />
            </div>

            <div className="flex flex-col gap-3">
              {activeHeader}
              {activeBody}
            </div>
          </div>

          {/* SIDEBAR — holdings-mix donut → risk posture (stacked). */}
          <div className="flex flex-col gap-6">
            <HoldingsMixCard positions={activePositions} />
            {posture ? (
              <RiskPostureCard posture={posture} layout="stacked" />
            ) : null}
          </div>
        </div>
      ) : (
        // No active positions — keep the branch header + dashed empty/
        // not-connected state, plus the posture snapshot when available.
        <div className="space-y-6">
          {posture ? (
            <RiskPostureCard posture={posture} layout="stacked" />
          ) : null}
          <div className="flex flex-col gap-3">
            {activeHeader}
            {activeBody}
          </div>
        </div>
      )}

      {/* Subtle reminder that the other book is also tracked — toggle to view. */}
      <p className="text-xs text-fg-muted">
        {otherLabel} book also tracked
        {isLive
          ? ` · ${otherPositions.length} paper position${
              otherPositions.length === 1 ? "" : "s"
            }`
          : live.connected
            ? ` · ${otherPositions.length} live position${
                otherPositions.length === 1 ? "" : "s"
              }`
            : " · live not connected"}
        . Use the header toggle to switch.
      </p>
    </div>
  );
}

/** Positions table + unrealized-P&L total, or a dashed empty card. */
function PositionsSection({
  positions,
  asOf,
  emptyLabel,
}: {
  positions: Position[];
  asOf?: string | null;
  emptyLabel: string;
}) {
  if (positions.length === 0) {
    return (
      <Card className="border-dashed">
        <p className="text-sm text-fg-muted">{emptyLabel}</p>
      </Card>
    );
  }
  const totalUnrealized = positions.reduce((s, p) => s + p.unrealizedPl, 0);
  return (
    <>
      <PositionsTable positions={positions} asOf={asOf} />
      <p className="mt-3 text-right text-sm tabular-nums text-fg-muted">
        Total unrealized{" "}
        <span className={totalUnrealized >= 0 ? "text-gain" : "text-loss"}>
          {formatCurrency(totalUnrealized, { signed: true })}
        </span>
      </p>
    </>
  );
}
