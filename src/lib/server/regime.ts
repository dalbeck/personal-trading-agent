import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStockBars, hasAlpacaCredentials } from "./alpaca";
import { getMarketConditions } from "./market-conditions";
import {
  ROTATION_LOOKBACK,
  ROTATION_TOP_N,
  SECTOR_ETFS,
  buildRegimeSummary,
  classifyTrend,
  rankSectors,
  trailingReturn,
  vixBand,
  type RegimeContext,
} from "@/lib/regime";

/**
 * Server resolver for the advisory market-regime context (M4). Leans on the
 * signals the desk already trusts — SPY daily bars (trend), the VIX
 * emergency-stop input, and sector-ETF relative performance — and is **fail-soft
 * and advisory only**: any data gap degrades to a neutral note, never throws,
 * and never gates or sizes anything.
 *
 * Result is TTL-cached to `data/control/regime.json` (an internal state file,
 * like the VIX cache) so the dashboard render and the pre-market routine share
 * one compute instead of re-pulling a dozen ETFs on every read.
 */

const DAY_MS = 86_400_000;
const REGIME_TTL_MS = Number(process.env.REGIME_CACHE_TTL_MS ?? 60 * 60_000);

function regimeCacheFile(dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "control", "regime.json");
}

async function readCache(
  dataDir: string | undefined,
  nowMs: number,
  ttlMs: number,
): Promise<RegimeContext | null> {
  try {
    const raw = await readFile(regimeCacheFile(dataDir), "utf8");
    const ctx = JSON.parse(raw) as RegimeContext & { fetchedAt?: string };
    const age = nowMs - Date.parse(ctx.fetchedAt ?? ctx.asOf);
    if (Number.isFinite(age) && age >= 0 && age <= ttlMs) return ctx;
    return null;
  } catch {
    return null;
  }
}

async function writeCache(
  ctx: RegimeContext,
  dataDir: string | undefined,
): Promise<void> {
  try {
    const file = regimeCacheFile(dataDir);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify({ ...ctx, fetchedAt: ctx.asOf }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    /* a cache write must never break a render */
  }
}

/** Daily closes for `symbol` over ~1Y, oldest → newest; [] on any failure. */
type BarsGetter = (symbol: string, startIso: string) => Promise<number[]>;

const defaultBarsGetter: BarsGetter = async (symbol, startIso) => {
  const bars = await getStockBars(symbol, {
    timeframe: "1Day",
    start: startIso,
  });
  return bars.map((b) => b.c);
};

export interface RegimeOpts {
  now?: Date;
  dataDir?: string;
  ttlMs?: number;
  /** Bypass + skip the cache (tests / forced refresh). */
  noCache?: boolean;
  /** Injectable seams (tests). */
  barsGetter?: BarsGetter;
  vixGetter?: () => Promise<number | null>;
  hasCredentials?: () => boolean;
}

/**
 * Resolve the regime context — TTL-cached, fail-soft. When Alpaca data is
 * unavailable the result is a clearly-degraded neutral read; callers always get
 * a renderable context.
 */
export async function getRegimeContext(
  opts?: RegimeOpts,
): Promise<RegimeContext> {
  const now = opts?.now ?? new Date();
  const ttlMs = opts?.ttlMs ?? REGIME_TTL_MS;

  if (!opts?.noCache) {
    const cached = await readCache(opts?.dataDir, now.getTime(), ttlMs);
    if (cached) return cached;
  }

  const asOf = now.toISOString();
  const hasCreds = (opts?.hasCredentials ?? hasAlpacaCredentials)();
  const barsGetter = opts?.barsGetter ?? defaultBarsGetter;

  // VIX comes from the same source the emergency-stop rail uses (fail-soft).
  let vix: number | null = null;
  try {
    const mc = await getMarketConditions(
      opts?.vixGetter ? { vix: opts.vixGetter } : { dataDir: opts?.dataDir, now },
    );
    vix = Number.isFinite(mc.vix) ? mc.vix : null;
  } catch {
    vix = null;
  }
  const band = vixBand(vix);

  if (!hasCreds) {
    const degraded: RegimeContext = {
      trend: "range",
      vix,
      vixBand: band,
      leaders: [],
      laggards: [],
      summary:
        "Market regime unavailable — connect Alpaca for the SPY-trend + sector-rotation read. Advisory context only — not a rail or a gate.",
      asOf,
      degraded: true,
    };
    return degraded;
  }

  const startIso = new Date(now.getTime() - 370 * DAY_MS).toISOString();

  // SPY trend + benchmark return; each sector ETF's trailing return. Every fetch
  // is independent and fail-soft — a single ETF gap just drops that sector.
  const spyCloses = await barsGetter("SPY", startIso).catch(() => [] as number[]);
  const spyReturn = trailingReturn(spyCloses, ROTATION_LOOKBACK);
  const trend = spyCloses.length > 0 ? classifyTrend(spyCloses) : "range";

  const sectorReturns = await Promise.all(
    SECTOR_ETFS.map(async (s) => {
      const closes = await barsGetter(s.symbol, startIso).catch(
        () => [] as number[],
      );
      return {
        symbol: s.symbol,
        name: s.name,
        returnPct: trailingReturn(closes, ROTATION_LOOKBACK),
      };
    }),
  );

  const ranked = rankSectors(sectorReturns, spyReturn);
  const leaders = ranked.slice(0, ROTATION_TOP_N);
  // Laggards start past the leaders so a thin set never lists a sector twice.
  const laggards = ranked
    .slice(Math.max(ROTATION_TOP_N, ranked.length - ROTATION_TOP_N))
    .reverse();
  const degraded = spyCloses.length === 0 || ranked.length === 0;

  const ctx: RegimeContext = {
    trend,
    vix,
    vixBand: band,
    leaders,
    laggards,
    summary: buildRegimeSummary(trend, vix, band, leaders, laggards),
    asOf,
    degraded,
  };

  if (!opts?.noCache) await writeCache(ctx, opts?.dataDir);
  return ctx;
}
