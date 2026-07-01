import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { disconnectLive } from "./gate";
import {
  checkFundingDeposit,
  enforceLiveDrawdownKill,
  evaluateLiveCaps,
  liveCapContextFromSnapshot,
  liveDrawdown,
  recordDeposit,
  weeklyFundingUsedUsd,
} from "./live-guards";
import type { ProposedOrder } from "@/lib/risk";
import type { PortfolioSnapshot } from "@/lib/types";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-guards-"));
}

const BUY: ProposedOrder = {
  symbol: "MSFT",
  action: "buy",
  side: "long",
  qty: 1,
  limitPrice: 50,
  orderType: "marketable_limit",
  stopPrice: 47,
  assetClass: "equity",
};

function snap(equity: number, curve: number[], positions: number[] = []): PortfolioSnapshot {
  return {
    account: "live",
    asOf: "2026-06-24T10:00:00-04:00",
    currency: "USD",
    equity,
    cash: equity,
    buyingPower: equity,
    totalPl: 0,
    totalPlPct: 0,
    dayPl: 0,
    dayPlPct: 0,
    positions: positions.map((mv, i) => ({
      symbol: `P${i}`,
      side: "long",
      qty: 1,
      avgCost: mv,
      lastPrice: mv,
      marketValue: mv,
      costBasis: mv,
      unrealizedPl: 0,
      unrealizedPlPct: 0,
      stopPrice: null,
      openedAt: "2026-06-01",
    })),
    equityCurve: curve.map((eq, i) => ({ date: `2026-06-0${i + 1}`, equity: eq })),
  } as PortfolioSnapshot;
}

describe("live order caps", () => {
  const limits = { weeklyFundingCapUsd: 100, maxAccountExposureUsd: 500, drawdownKillPct: 0.1 };

  it("allows a buy within the exposure ceiling and funded capital", () => {
    const d = evaluateLiveCaps(
      BUY,
      { currentExposureUsd: 100, fundedCapitalUsd: 100 },
      limits,
    );
    expect(d.ok).toBe(true);
  });

  it("blocks a buy that breaches the account exposure ceiling", () => {
    const d = evaluateLiveCaps(
      { ...BUY, qty: 1, limitPrice: 60 },
      { currentExposureUsd: 480, fundedCapitalUsd: 1000 },
      limits,
    );
    expect(d.ok).toBe(false);
    expect(d.violations.map((v) => v.rule)).toContain("live-max-exposure");
  });

  it("binds a no-stop, target-weight core order the same (cross-sleeve envelope, M2)", () => {
    // The live envelope is USD-based and sleeve-agnostic: a core-long order with
    // no stop and a target weight is still bound by the $500 account ceiling.
    const coreBuy: ProposedOrder = {
      ...BUY,
      symbol: "VOO",
      qty: 2,
      limitPrice: 60, // $120 order, exposure already $480 → over the $500 ceiling
      stopPrice: null,
      requiresStop: false,
      reviewTriggerPct: 0.25,
      targetWeightPct: 0.4,
    };
    const d = evaluateLiveCaps(
      coreBuy,
      { currentExposureUsd: 480, fundedCapitalUsd: 1000 },
      limits,
    );
    expect(d.ok).toBe(false);
    expect(d.violations.map((v) => v.rule)).toContain("live-max-exposure");
  });

  it("blocks a buy that costs more than the funded capital", () => {
    const d = evaluateLiveCaps(
      { ...BUY, qty: 10, limitPrice: 50 },
      { currentExposureUsd: 0, fundedCapitalUsd: 100 },
      limits,
    );
    expect(d.ok).toBe(false);
    expect(d.violations.map((v) => v.rule)).toContain("live-funded-cap");
  });

  it("does not cap sells (they reduce risk)", () => {
    const d = evaluateLiveCaps(
      { ...BUY, action: "sell", qty: 100, limitPrice: 50 },
      { currentExposureUsd: 490, fundedCapitalUsd: 0 },
      limits,
    );
    expect(d.ok).toBe(true);
  });

  it("derives context from a live snapshot", () => {
    const ctx = liveCapContextFromSnapshot(snap(300, [300], [120, 80]));
    expect(ctx.currentExposureUsd).toBe(200);
    expect(ctx.fundedCapitalUsd).toBe(300);
  });
});

describe("live drawdown kill switch", () => {
  it("computes drawdown from the high-water mark", () => {
    const dd = liveDrawdown(snap(90, [100, 95, 90]));
    expect(dd.highWaterUsd).toBe(100);
    expect(dd.drawdownPct).toBeCloseTo(0.1, 5);
    expect(dd.breached).toBe(true);
  });

  it("is not breached above the threshold", () => {
    expect(liveDrawdown(snap(96, [100, 96])).breached).toBe(false);
  });

  it("uses the persisted high-water floor for a live snapshot with an empty curve", () => {
    // A real live snapshot carries equityCurve: [] — without the floor the peak
    // would be the current equity and drawdown would read 0.
    const dd = liveDrawdown(snap(90, []), undefined, 100);
    expect(dd.highWaterUsd).toBe(100);
    expect(dd.drawdownPct).toBeCloseTo(0.1, 5);
    expect(dd.breached).toBe(true);
  });

  it("floors an empty-curve snapshot but never below its own equity", () => {
    // A stale/low floor must not fabricate a drawdown below the live equity.
    const dd = liveDrawdown(snap(120, []), undefined, 80);
    expect(dd.highWaterUsd).toBe(120);
    expect(dd.drawdownPct).toBe(0);
  });

  it("enforceLiveDrawdownKill halts a live snapshot via the persisted high-water", async () => {
    const dir = await tmp();
    const halts: string[] = [];
    // equity 85, empty curve (live shape) — dead without the floor. With a 100
    // high-water it is a −15% drawdown, past the kill threshold.
    const res = await enforceLiveDrawdownKill(snap(85, []), {
      dataDir: dir,
      highWaterUsd: 100,
      halt: async (r) => void halts.push(r),
      alert: async () => {},
    });
    expect(res.highWaterUsd).toBe(100);
    expect(res.breached).toBe(true);
    expect(res.halted).toBe(true);
    expect(halts).toHaveLength(1);
  });

  it("halts and alerts when breached", async () => {
    const dir = await tmp();
    const halts: string[] = [];
    const alerts: string[] = [];
    const res = await enforceLiveDrawdownKill(snap(85, [100, 85]), {
      dataDir: dir,
      halt: async (r) => void halts.push(r),
      alert: async (t) => void alerts.push(t),
    });
    expect(res.breached).toBe(true);
    expect(res.halted).toBe(true);
    expect(halts).toHaveLength(1);
    expect(alerts[0]).toMatch(/kill switch/i);
  });

  it("does not re-alert if already disconnected", async () => {
    const dir = await tmp();
    await disconnectLive({ dataDir: dir, reason: "prior halt" });
    const alerts: string[] = [];
    const res = await enforceLiveDrawdownKill(snap(85, [100, 85]), {
      dataDir: dir,
      alert: async (t) => void alerts.push(t),
    });
    expect(res.halted).toBe(true);
    expect(alerts).toHaveLength(0); // idempotent — no duplicate alert
  });

  it("does nothing when not breached", async () => {
    const dir = await tmp();
    let halted = false;
    const res = await enforceLiveDrawdownKill(snap(98, [100, 98]), {
      dataDir: dir,
      halt: async () => void (halted = true),
    });
    expect(res.breached).toBe(false);
    expect(res.halted).toBe(false);
    expect(halted).toBe(false);
  });
});

describe("weekly funding cap", () => {
  const at = "2026-06-24T10:00:00-04:00";

  it("tracks deposits within the rolling 7-day window", async () => {
    const dir = await tmp();
    await recordDeposit(40, at, { dataDir: dir });
    await recordDeposit(30, at, { dataDir: dir });
    expect(await weeklyFundingUsedUsd(at, { dataDir: dir })).toBe(70);
  });

  it("refuses a deposit that would breach the weekly cap", async () => {
    const dir = await tmp();
    await recordDeposit(80, at, { dataDir: dir });
    await expect(recordDeposit(40, at, { dataDir: dir })).rejects.toThrow(
      /weekly funding cap/i,
    );
  });

  it("excludes deposits older than 7 days", async () => {
    const dir = await tmp();
    await recordDeposit(90, "2026-06-10T10:00:00-04:00", { dataDir: dir });
    const check = await checkFundingDeposit(90, at, { dataDir: dir });
    expect(check.usedUsd).toBe(0); // the old deposit has rolled off
    expect(check.ok).toBe(true);
  });
});
