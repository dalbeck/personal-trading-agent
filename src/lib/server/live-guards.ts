import "server-only";

import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { LIVE_LIMITS, type LiveLimits } from "@strategy/charter.config";
import type { ProposedOrder, RiskDecision, Violation } from "@/lib/risk";
import type { PortfolioSnapshot } from "@/lib/types";
import { disconnectLive, isDisconnected } from "./gate";
import { pingDeadMan, sendHeartbeat } from "./notify";

/**
 * Phase 3 M4 — **live-only** caps and breakers layered on the Phase 2 risk
 * engine, for the funded Robinhood account:
 *
 *   1. **Account exposure ceiling** — total live exposure may not exceed
 *      `LIVE_LIMITS.maxAccountExposureUsd`.
 *   2. **Funded-capital guard** — an order may not cost more than the account's
 *      available funded capital.
 *   3. **Weekly funding cap** — human deposits are capped per rolling 7 days.
 *   4. **Live drawdown kill switch** — at `LIVE_LIMITS.drawdownKillPct` below
 *      the live high-water mark, halt new risk (latch live OFF) and alert.
 *
 * Caps are pure/testable; the kill switch's halt + alert are injectable. Limits
 * come from the charter config (`LIVE_LIMITS`) — never hardcode them here.
 */

/* --------------------------- order-level caps ----------------------------- */

export interface LiveCapContext {
  /** Total current live exposure (sum of position market values), USD. */
  currentExposureUsd: number;
  /** Available funded capital the order can draw on (USD). */
  fundedCapitalUsd: number;
}

/** Evaluate the live order caps. Returns a `RiskDecision` so a breach journals
 *  through the same `recordRiskRejection` path as the charter rails. Buys add
 *  exposure and spend capital; sells reduce risk, so they are not capped here. */
export function evaluateLiveCaps(
  order: ProposedOrder,
  ctx: LiveCapContext,
  limits: LiveLimits = LIVE_LIMITS,
): RiskDecision {
  const violations: Violation[] = [];
  if (order.action === "buy") {
    const orderCostUsd = order.qty * order.limitPrice;

    if (ctx.currentExposureUsd + orderCostUsd > limits.maxAccountExposureUsd) {
      violations.push({
        rule: "live-max-exposure",
        message: `Order would push live exposure to $${(
          ctx.currentExposureUsd + orderCostUsd
        ).toFixed(2)}, over the $${limits.maxAccountExposureUsd} account ceiling.`,
      });
    }

    if (orderCostUsd > ctx.fundedCapitalUsd) {
      violations.push({
        rule: "live-funded-cap",
        message: `Order cost $${orderCostUsd.toFixed(2)} exceeds funded capital $${ctx.fundedCapitalUsd.toFixed(
          2,
        )}.`,
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Build a live cap context from a live snapshot (positions + buying power). */
export function liveCapContextFromSnapshot(
  snapshot: PortfolioSnapshot | null,
  fallbackFundedUsd = 0,
): LiveCapContext {
  if (!snapshot) {
    return { currentExposureUsd: 0, fundedCapitalUsd: fallbackFundedUsd };
  }
  return {
    currentExposureUsd: snapshot.positions.reduce(
      (s, p) => s + Math.max(0, p.marketValue),
      0,
    ),
    fundedCapitalUsd: snapshot.buyingPower,
  };
}

/* ---------------------------- drawdown kill ------------------------------- */

export interface DrawdownStatus {
  highWaterUsd: number;
  drawdownPct: number; // positive fraction; 0.12 === −12%
  breached: boolean;
  killPct: number;
}

export function liveDrawdown(
  snapshot: PortfolioSnapshot,
  limits: LiveLimits = LIVE_LIMITS,
): DrawdownStatus {
  const highWaterUsd = Math.max(
    snapshot.equity,
    ...snapshot.equityCurve.map((p) => p.equity),
    0,
  );
  const drawdownPct =
    highWaterUsd > 0 ? Math.max(0, (highWaterUsd - snapshot.equity) / highWaterUsd) : 0;
  return {
    highWaterUsd,
    drawdownPct,
    breached: drawdownPct >= limits.drawdownKillPct,
    killPct: limits.drawdownKillPct,
  };
}

export interface KillResult extends DrawdownStatus {
  halted: boolean;
}

export interface KillOpts {
  limits?: LiveLimits;
  cwd?: string;
  dataDir?: string;
  settingsPaths?: string[];
  /** Test seams. */
  halt?: (reason: string) => Promise<void>;
  alert?: (title: string, message: string) => Promise<void>;
  now?: string;
}

/**
 * The live drawdown kill switch: if the live account has drawn down past the
 * configured threshold, latch live trading OFF (disconnect) and fire an alert.
 * Idempotent — if already disconnected it won't re-alert. Fail-soft on alerts.
 */
export async function enforceLiveDrawdownKill(
  snapshot: PortfolioSnapshot,
  opts: KillOpts = {},
): Promise<KillResult> {
  const dd = liveDrawdown(snapshot, opts.limits);
  if (!dd.breached) return { ...dd, halted: false };

  const already = await isDisconnected({
    cwd: opts.cwd,
    dataDir: opts.dataDir,
  });
  if (already) return { ...dd, halted: true };

  const pct = (dd.drawdownPct * 100).toFixed(1);
  const reason = `Live drawdown −${pct}% breached the −${(
    dd.killPct * 100
  ).toFixed(0)}% kill threshold.`;

  const halt = opts.halt ?? ((r: string) => disconnectLive({ cwd: opts.cwd, dataDir: opts.dataDir, reason: r, at: opts.now }));
  await halt(reason);

  const alert =
    opts.alert ??
    (async (title: string, message: string) => {
      await sendHeartbeat(title, message, { priority: 5 });
      await pingDeadMan("live-drawdown-kill", "fail");
    });
  // Fail-soft: an alert failure must never undo the halt or throw.
  await alert("LIVE KILL SWITCH TRIPPED", reason).catch(() => {});

  return { ...dd, halted: true };
}

/* --------------------------- weekly funding cap --------------------------- */

interface DepositRecord {
  amountUsd: number;
  at: string; // ISO timestamp
}

function fundingPath(opts?: { cwd?: string; dataDir?: string }): string {
  const root =
    opts?.dataDir ??
    process.env.TRADING_DATA_DIR ??
    path.join(opts?.cwd ?? process.cwd(), "data");
  return path.join(root, "control", "funding.json");
}

async function readDeposits(opts?: {
  cwd?: string;
  dataDir?: string;
}): Promise<DepositRecord[]> {
  try {
    const raw = JSON.parse(await readFile(fundingPath(opts), "utf8"));
    if (Array.isArray(raw?.deposits)) {
      return (raw.deposits as DepositRecord[]).filter(
        (d) => typeof d.amountUsd === "number" && typeof d.at === "string",
      );
    }
  } catch {
    /* no file yet */
  }
  return [];
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Sum of deposits within the rolling 7 days ending at `asOf`. */
export async function weeklyFundingUsedUsd(
  asOf: string,
  opts?: { cwd?: string; dataDir?: string },
): Promise<number> {
  const deposits = await readDeposits(opts);
  const cutoff = new Date(asOf).getTime() - WEEK_MS;
  return deposits
    .filter((d) => new Date(d.at).getTime() > cutoff)
    .reduce((s, d) => s + d.amountUsd, 0);
}

export interface FundingCheck {
  ok: boolean;
  usedUsd: number;
  remainingUsd: number;
  capUsd: number;
}

/** Would a deposit of `amountUsd` keep within the rolling weekly funding cap? */
export async function checkFundingDeposit(
  amountUsd: number,
  asOf: string,
  opts?: { cwd?: string; dataDir?: string; limits?: LiveLimits },
): Promise<FundingCheck> {
  const capUsd = (opts?.limits ?? LIVE_LIMITS).weeklyFundingCapUsd;
  const usedUsd = await weeklyFundingUsedUsd(asOf, opts);
  const remainingUsd = Math.max(0, capUsd - usedUsd);
  return { ok: usedUsd + amountUsd <= capUsd, usedUsd, remainingUsd, capUsd };
}

/**
 * Record a human deposit against the weekly cap. Refuses (throws) if it would
 * breach the cap — a code guard, not just a display. The agent never funds; this
 * exists so the human's own deposits are bounded and audited.
 */
export async function recordDeposit(
  amountUsd: number,
  asOf: string,
  opts?: { cwd?: string; dataDir?: string; limits?: LiveLimits },
): Promise<FundingCheck> {
  const check = await checkFundingDeposit(amountUsd, asOf, opts);
  if (!check.ok) {
    throw new Error(
      `Deposit of $${amountUsd.toFixed(2)} would breach the weekly funding cap ` +
        `($${check.usedUsd.toFixed(2)} used of $${check.capUsd}).`,
    );
  }
  const deposits = await readDeposits(opts);
  deposits.push({ amountUsd, at: asOf });
  const file = fundingPath(opts);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ deposits }, null, 2)}\n`, "utf8");
  return checkFundingDeposit(0, asOf, opts);
}
