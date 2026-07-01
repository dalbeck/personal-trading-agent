import "server-only";

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getStockSnapshot, hasAlpacaCredentials } from "./alpaca";
import { getRobinhoodVix } from "./robinhood";

/**
 * Live market conditions for the charter **emergency-stop** rail (SPY −2%
 * intraday OR VIX > 30), read at decision time so the rail fires on the real
 * tape rather than a placeholder.
 *
 * - **SPY intraday change** comes from Alpaca — the desk's single source of
 *   truth for prices (`.agents/infra.md`) — as `(last − prevClose) / prevClose`.
 *   This works on the free IEX feed.
 * - **VIX** has no reliable free Alpaca feed (the IEX/SIP stock endpoints return
 *   "asset not found" for `^VIX`), so it is sourced through an **injectable**
 *   `vix` seam and defaults to a neutral level when no source is wired. The SPY
 *   arm — the dominant broad-market-stress signal, and the one Alpaca serves
 *   reliably — is always live.
 *
 * Best-effort and **fail-soft**: any fetch error or missing data degrades to the
 * neutral reading (`spyIntradayChangePct: 0`, `vix: 15`) so the order path never
 * crashes on a market-data hiccup. The neutral reading does NOT trip the rail —
 * a transient data failure must not silently block every order — so when SPY/VIX
 * data is unavailable the emergency stop simply does not fire.
 */

export interface MarketConditions {
  /** SPY intraday change as a fraction: -0.025 === SPY −2.5%. */
  spyIntradayChangePct: number;
  vix: number;
  /** Whether the SPY read yielded a usable value (vs. falling back to neutral).
   *  Optional so existing `{ spyIntradayChangePct, vix }` literals still satisfy
   *  the type; `getMarketConditions` always sets it. The live emergency-stop
   *  block fires only on an explicit `false` (a real fetch failure). */
  spyAvailable?: boolean;
  /** Whether a VIX value was sourced (vs. the neutral default). VIX has no
   *  reliable free feed, so this is informational — it does not block orders. */
  vixAvailable?: boolean;
}

/** The neutral reading used when a source is unavailable — trips no rail. Both
 *  arms are flagged unavailable, since neutral *is* the no-data state. */
export const NEUTRAL_MARKET: MarketConditions = {
  spyIntradayChangePct: 0,
  vix: 15,
  spyAvailable: false,
  vixAvailable: false,
};

/** SPY snapshot getter seam (defaults to Alpaca's IEX snapshot). */
export type SpyChangeGetter = () => Promise<number | null>;
/** VIX level getter seam (defaults to Robinhood `get_index_quotes`, TTL-cached). */
export type VixGetter = () => Promise<number | null>;

/** How long a fetched VIX is reused before the (slow) Robinhood CLI is re-spawned.
 *  VIX is a live signal, so this is a short time-TTL — not the manual-refresh
 *  policy used for symbol research. */
const VIX_TTL_MS = Number(process.env.VIX_CACHE_TTL_MS ?? 10 * 60_000);

const VixCacheSchema = z.object({
  vix: z.number(),
  fetchedAt: z.string(),
});

function marketCondFile(dataDir?: string): string {
  const root =
    dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(root, "control", "market-conditions.json");
}

/** Read the cached VIX if it is within the TTL window, else null. Best-effort. */
async function readVixCache(
  dataDir: string | undefined,
  nowMs: number,
  ttlMs: number,
): Promise<number | null> {
  try {
    const raw = await readFile(marketCondFile(dataDir), "utf8");
    const { vix, fetchedAt } = VixCacheSchema.parse(JSON.parse(raw));
    const age = nowMs - Date.parse(fetchedAt);
    if (Number.isFinite(age) && age >= 0 && age <= ttlMs && vix > 0) return vix;
    return null;
  } catch {
    return null;
  }
}

/** Persist a freshly-fetched VIX with its timestamp. Best-effort; never throws. */
async function writeVixCache(
  vix: number,
  dataDir: string | undefined,
  nowIso: string,
): Promise<void> {
  try {
    const file = marketCondFile(dataDir);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      `${JSON.stringify({ vix, fetchedAt: nowIso }, null, 2)}\n`,
      "utf8",
    );
  } catch {
    /* a cache write must never break the order path */
  }
}

/** Default VIX getter: serve a TTL-fresh cached value, else spawn the Robinhood
 *  read once and cache it. Returns null (→ neutral) when no source is available.
 *  `fetcher` is the injectable raw Robinhood read (tests bypass the CLI). */
async function cachedRobinhoodVix(opts: {
  dataDir?: string;
  now: Date;
  ttlMs: number;
  fetcher?: () => Promise<unknown>;
}): Promise<number | null> {
  const cached = await readVixCache(opts.dataDir, opts.now.getTime(), opts.ttlMs);
  if (cached != null) return cached;
  const fresh = await getRobinhoodVix(
    opts.fetcher ? { fetcher: opts.fetcher } : undefined,
  );
  if (fresh != null) await writeVixCache(fresh, opts.dataDir, opts.now.toISOString());
  return fresh;
}

/** SPY intraday change as a fraction from the Alpaca snapshot, or null. */
async function alpacaSpyChange(
  fetchImpl?: typeof fetch,
): Promise<number | null> {
  const snap = await getStockSnapshot("SPY", { fetchImpl });
  const last = snap.latestTrade?.p ?? snap.dailyBar?.c ?? null;
  const prevClose = snap.prevDailyBar?.c ?? null;
  if (last == null || prevClose == null || prevClose === 0) return null;
  return (last - prevClose) / prevClose;
}

/**
 * Resolve live market conditions for the emergency-stop rail. Injectable seams
 * (`spyChange`, `vix`, `fetchImpl`) keep it unit-testable offline; the real
 * defaults read Alpaca for SPY and leave VIX neutral unless a source is wired.
 */
export async function getMarketConditions(opts?: {
  spyChange?: SpyChangeGetter;
  vix?: VixGetter;
  fetchImpl?: typeof fetch;
  /** Data dir + clock for the VIX TTL cache (tests pin them). */
  dataDir?: string;
  now?: Date;
  /** Override the VIX cache TTL (tests). */
  vixTtlMs?: number;
  /** Raw Robinhood VIX fetch flowing through the TTL cache (tests bypass the CLI). */
  vixFetcher?: () => Promise<unknown>;
}): Promise<MarketConditions> {
  const now = opts?.now ?? new Date();
  const spyChange =
    opts?.spyChange ??
    (hasAlpacaCredentials() || opts?.fetchImpl
      ? () => alpacaSpyChange(opts?.fetchImpl)
      : null);
  // Default VIX: TTL-cached Robinhood read. getRobinhoodVix self-gates on a
  // Robinhood connection and returns null (→ neutral) when absent.
  const vixGetter =
    opts?.vix ??
    (() =>
      cachedRobinhoodVix({
        dataDir: opts?.dataDir,
        now,
        ttlMs: opts?.vixTtlMs ?? VIX_TTL_MS,
        fetcher: opts?.vixFetcher,
      }));

  let spyIntradayChangePct = NEUTRAL_MARKET.spyIntradayChangePct;
  let spyAvailable = false;
  if (spyChange) {
    try {
      const v = await spyChange();
      if (v != null && Number.isFinite(v)) {
        spyIntradayChangePct = v;
        spyAvailable = true;
      }
    } catch {
      /* fail-soft → neutral, spyAvailable stays false */
    }
  }

  let vix = NEUTRAL_MARKET.vix;
  let vixAvailable = false;
  if (vixGetter) {
    try {
      const v = await vixGetter();
      if (v != null && Number.isFinite(v) && v > 0) {
        vix = v;
        vixAvailable = true;
      }
    } catch {
      /* fail-soft → neutral, vixAvailable stays false */
    }
  }

  return { spyIntradayChangePct, vix, spyAvailable, vixAvailable };
}
