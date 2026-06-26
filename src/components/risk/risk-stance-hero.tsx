import { HeroCard, HeroStat } from "@/components/hero-card";
import { Badge } from "@/components/ui/badge";
import { Term } from "@/components/term";
import { ScaleIcon, RiskIcon, CheckIcon } from "@/components/icons";
import { summarizeRiskStance, type RiskCharter } from "./risk-stance";
import type { RiskSettings } from "@/lib/types";

/**
 * The focal surface for the Risk settings page: a single hero that VISUALIZES
 * the human's current standing stance — how many of the five charter rails are
 * customised and what the effective numeric limits are versus the charter
 * defaults. Pure presentation, derived only from `settings` vs `charter` via
 * `summarizeRiskStance`; no invented score, no rail/default/endpoint change.
 */

const pctText = (fraction: number) => `${Math.round(fraction * 1000) / 10}%`;

export function RiskStanceHero({
  settings,
  charter,
}: {
  settings: RiskSettings;
  charter: RiskCharter;
}) {
  const s = summarizeRiskStance(settings, charter);
  const allDefaults = s.customizedCount === 0;

  // The headline number is the focal figure; render it in the serif voice.
  const headlineTone = s.anyDisabled ? "text-loss" : "text-fg";

  return (
    <HeroCard surface="surface-hero-accent" className="mb-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden
              className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-[14px] bg-accent/15 text-accent"
            >
              <ScaleIcon className="size-5" />
            </span>
            <div className="min-w-0">
              <span className="text-xs font-medium uppercase tracking-wide text-fg-muted">
                Your standing risk stance
              </span>
              <h2 className="mt-1.5 text-balance font-serif text-[1.6rem] font-semibold leading-tight text-fg md:text-[1.85rem]">
                {allDefaults ? (
                  <>All five rails at charter defaults</>
                ) : (
                  <>
                    <span className={`tabular-nums ${headlineTone}`}>
                      {s.customizedCount}
                    </span>{" "}
                    of {s.totalRails} rails customized
                  </>
                )}
              </h2>
              <p className="mt-1.5 max-w-md text-pretty text-sm text-fg-muted">
                {allDefaults
                  ? "Nothing is overridden — every approval is checked against the safe charter guardrails."
                  : "Overrides layer in at per-trade approval. The charter defaults stay the safe baseline underneath."}
              </p>
            </div>
          </div>

          {s.anyDisabled ? (
            <Badge tone="loss" solid dot>
              {s.disabledCount} rail{s.disabledCount === 1 ? "" : "s"} OFF
            </Badge>
          ) : (
            <Badge tone="gain" solid>
              <CheckIcon className="size-3.5" aria-hidden />
              All rails enabled
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <HeroStat
            icon={RiskIcon}
            label="Per-position cap"
            value={
              s.positionSize.enabled ? pctText(s.positionSize.effective) : "Off"
            }
            tone={s.positionSize.enabled ? "neutral" : "loss"}
            delta={
              s.positionSize.enabled && s.positionSize.overridden
                ? `charter ${pctText(s.positionSize.charter)}`
                : s.positionSize.enabled
                  ? "charter default"
                  : undefined
            }
            deltaTone="neutral"
          />
          <HeroStat
            label="Daily order cap"
            value={
              s.dailyOrderCap.enabled
                ? `${s.dailyOrderCap.effective}`
                : "Off"
            }
            tone={s.dailyOrderCap.enabled ? "neutral" : "loss"}
            delta={
              s.dailyOrderCap.enabled && s.dailyOrderCap.overridden
                ? `charter ${s.dailyOrderCap.charter}`
                : s.dailyOrderCap.enabled
                  ? "charter default"
                  : undefined
            }
            deltaTone="neutral"
          />
          <HeroStat
            label="Drawdown halt"
            value={
              s.drawdownHalt.enabled ? pctText(s.drawdownHalt.effective) : "Off"
            }
            tone={s.drawdownHalt.enabled ? "neutral" : "loss"}
            delta={
              s.drawdownHalt.enabled && s.drawdownHalt.overridden
                ? `charter ${pctText(s.drawdownHalt.charter)}`
                : s.drawdownHalt.enabled
                  ? "charter default"
                  : undefined
            }
            deltaTone="neutral"
          />
        </div>

        <p className="text-pretty text-xs text-fg-muted">
          These are per-trade{" "}
          <Term term="two-gate">approval</Term> gates, not the live-trading
          gate — they never open a gate or place an order. The{" "}
          <Term term="drawdown">drawdown halt</Term> and the other rails are
          checked when you approve each trade.
        </p>
      </div>
    </HeroCard>
  );
}
