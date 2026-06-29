import { Card, PageTitle, SectionTitle } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import { AllocationTargetsEditor } from "@/components/portfolio/allocation-targets-editor";
import { getPortfolioOverview } from "@/lib/server/portfolio";
import { SLEEVE_LABEL, HORIZON_LABEL, horizonOf } from "@/lib/sleeves";
import type { Sleeve } from "@/lib/sleeves";
import { formatCurrency, formatPercent } from "@/lib/format";

export const dynamic = "force-dynamic";

function sleeveLabel(s: Sleeve | "unattributed"): string {
  return s === "unattributed" ? "Unattributed" : SLEEVE_LABEL[s];
}

function pct(n: number): string {
  return formatPercent(n, { signed: false });
}

export default async function PortfolioPage() {
  const o = await getPortfolioOverview();
  const hasTargets = o.targets.targets.length > 0;
  const pastBand = o.drift.filter((d) => d.pastBand);

  return (
    <div>
      <PageTitle
        title="Portfolio"
        subtitle={`Target vs current allocation across sleeves, per-sleeve + blended performance, and any rebalancing suggestions for the ${o.mode} book. The agent reads the targets and proposes against them — you set the mix; nothing auto-trades.`}
      />

      {/* Equity + cash summary */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-fg-muted">Equity</p>
            <p className="font-serif text-2xl font-semibold tabular-nums text-fg">
              {formatCurrency(o.equityUsd)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-fg-muted">Cash</p>
            <p className="font-serif text-2xl font-semibold tabular-nums text-fg">
              {formatCurrency(o.cashUsd)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-fg-muted">
              Blended benchmark
            </p>
            <p className="font-serif text-lg font-medium text-fg">
              {o.blended.benchmark}
            </p>
          </div>
        </div>
      </Card>

      {/* Target vs current allocation + drift */}
      <Card className="mb-6">
        <SectionTitle title="Target vs current allocation" />
        {hasTargets ? (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-muted">
                <th className="py-2 font-medium">Sleeve</th>
                <th className="py-2 text-right font-medium">Target</th>
                <th className="py-2 text-right font-medium">Current</th>
                <th className="py-2 text-right font-medium">Drift</th>
                <th className="py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {o.drift.map((d) => (
                <tr key={d.sleeve} className="border-b border-line/60">
                  <td className="py-2.5">
                    <span className="font-medium text-fg">{SLEEVE_LABEL[d.sleeve]}</span>{" "}
                    <Badge tone="muted">{HORIZON_LABEL[horizonOf(d.sleeve)]}</Badge>
                  </td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{pct(d.targetPct)}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{pct(d.currentPct)}</td>
                  <td
                    className={`py-2.5 text-right tabular-nums ${
                      d.driftPct > 0 ? "text-gain" : d.driftPct < 0 ? "text-loss" : "text-fg"
                    }`}
                  >
                    {d.driftPct >= 0 ? "+" : ""}
                    {pct(d.driftPct)}
                  </td>
                  <td className="py-2.5 text-right">
                    <Badge
                      tone={
                        d.status === "on-target"
                          ? "muted"
                          : d.status === "over"
                            ? "gain"
                            : "loss"
                      }
                    >
                      {d.status === "on-target"
                        ? "On target"
                        : d.status === "over"
                          ? "Overweight"
                          : "Underweight"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-fg-muted">
            No target allocation set yet. Define a per-sleeve mix below to track
            drift and surface rebalancing suggestions.
          </p>
        )}
      </Card>

      {/* Rebalancing suggestions */}
      {hasTargets ? (
        <Card className="mb-6">
          <SectionTitle title="Rebalancing suggestions" />
          {o.rebalance.trades.length === 0 && o.rebalance.gaps.length === 0 ? (
            <p className="mt-3 text-sm text-fg-muted">
              {pastBand.length === 0
                ? "Every sleeve is within its drift band — nothing to rebalance."
                : "Drift is past the band, but no concrete trim/add could be formed from current holdings."}
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {o.rebalance.trades.map((t, i) => (
                <div
                  key={`${t.symbol}-${i}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line bg-surface px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge tone={t.action === "buy" ? "gain" : "loss"} solid>
                      {t.action.toUpperCase()}
                    </Badge>
                    <span className="font-semibold text-fg">{t.symbol}</span>
                    <span className="tabular-nums text-fg-muted">
                      {t.qty} sh · {formatCurrency(t.estUsd)}
                    </span>
                    {t.stagedPlan ? (
                      <Badge tone="muted">{t.stagedPlan.tranches.length} tranches</Badge>
                    ) : null}
                  </div>
                  <span className="text-xs text-fg-muted">{t.reason}</span>
                </div>
              ))}
              {o.rebalance.gaps.map((g) => (
                <div
                  key={g.sleeve}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-dashed border-line bg-surface px-3 py-2 text-sm"
                >
                  <span className="text-fg">
                    Add ~{formatCurrency(g.deficitUsd)} to{" "}
                    <span className="font-medium">{SLEEVE_LABEL[g.sleeve]}</span>
                  </span>
                  <span className="text-xs text-fg-muted">
                    Needs a candidate — run sleeve-aware discovery
                  </span>
                </div>
              ))}
              <p className="pt-1 text-xs text-fg-muted">
                Suggestions only — trim/add ideas the human queues into the normal
                gated approval flow (each tranche a separate approval). Nothing is
                placed here.
              </p>
            </div>
          )}
        </Card>
      ) : null}

      {/* Per-sleeve + blended performance */}
      <Card className="mb-6">
        <SectionTitle title="Performance by sleeve" />
        {o.perf.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">No holdings in the {o.mode} book.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-fg-muted">
                <th className="py-2 font-medium">Sleeve</th>
                <th className="py-2 text-right font-medium">Positions</th>
                <th className="py-2 text-right font-medium">Market value</th>
                <th className="py-2 text-right font-medium">Unrealized P&L</th>
                <th className="py-2 text-right font-medium">Benchmark</th>
              </tr>
            </thead>
            <tbody>
              {o.perf.map((p) => (
                <tr key={p.sleeve} className="border-b border-line/60">
                  <td className="py-2.5 font-medium text-fg">{sleeveLabel(p.sleeve)}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">{p.positions}</td>
                  <td className="py-2.5 text-right tabular-nums text-fg">
                    {formatCurrency(p.marketValueUsd)}
                  </td>
                  <td
                    className={`py-2.5 text-right tabular-nums ${
                      p.unrealizedPlUsd > 0 ? "text-gain" : p.unrealizedPlUsd < 0 ? "text-loss" : "text-fg"
                    }`}
                  >
                    {formatCurrency(p.unrealizedPlUsd)}
                    {p.unrealizedPlPct != null ? ` (${pct(p.unrealizedPlPct)})` : ""}
                  </td>
                  <td className="py-2.5 text-right text-fg-muted">{p.benchmark ?? "—"}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-line font-medium">
                <td className="py-2.5 text-fg">Blended</td>
                <td className="py-2.5 text-right tabular-nums text-fg">
                  {o.perf.reduce((s, p) => s + p.positions, 0)}
                </td>
                <td className="py-2.5 text-right tabular-nums text-fg">
                  {formatCurrency(o.blended.marketValueUsd)}
                </td>
                <td
                  className={`py-2.5 text-right tabular-nums ${
                    o.blended.unrealizedPlUsd > 0 ? "text-gain" : o.blended.unrealizedPlUsd < 0 ? "text-loss" : "text-fg"
                  }`}
                >
                  {formatCurrency(o.blended.unrealizedPlUsd)}
                  {o.blended.unrealizedPlPct != null ? ` (${pct(o.blended.unrealizedPlPct)})` : ""}
                </td>
                <td className="py-2.5 text-right text-fg-muted">{o.blended.benchmark}</td>
              </tr>
            </tbody>
          </table>
        )}
        {o.perf.some((p) => p.sleeve === "unattributed") ? (
          <p className="mt-2 text-xs text-fg-muted">
            Unattributed holdings predate sleeve tagging (or were opened outside the
            desk); their opening trade carries no sleeve tag.
          </p>
        ) : null}
      </Card>

      {/* Human-set targets editor */}
      <AllocationTargetsEditor targets={o.targets} />
    </div>
  );
}
