import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { ROBINHOOD_MCP_SERVER } from "./gate";
import { FORBIDDEN_TOOLS, hasRobinhoodConnection } from "./robinhood";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";
import type { ScanFilters, ScanResult } from "@/lib/scanner";

/**
 * Server-side market scanner — the discovery funnel over the Robinhood Agentic
 * MCP's scanner tool. Like the other Robinhood reads (`robinhood.ts`), it bridges
 * through the host `claude` CLI's authenticated MCP session (no token), spawns
 * with argv (never a shell), allow-lists ONLY the scanner tool, and explicitly
 * disallows every order / enumeration tool. It places nothing and reads no
 * brokerage account — it is market data.
 *
 * It is **off by default** and gated two ways: `SCANNER_ENABLED` must be set AND
 * a Robinhood Agentic account must be connected. We ask the authenticated model
 * to run a scan and emit OUR fixed JSON schema (copying values verbatim), so we
 * don't depend on Robinhood's raw output shape.
 *
 * **Reality of the live tool (confirmed against the June-2026 Agentic MCP).** The
 * scanner is a **saved-scan** model, not a single ad-hoc call:
 *   - `run_scan` takes a **`scan_id`** — it executes a *saved* scan; it does NOT
 *     accept filters.
 *   - Ad-hoc filters are applied via `create_scan` (preset + custom filters,
 *     returns the initial live results) or `update_scan_filters` (REPLACE
 *     semantics on an existing scan). Filters use Robinhood's `FILTER_TYPE_*`
 *     enums (e.g. `FILTER_TYPE_RSI`, `FILTER_TYPE_RELATIVE_VOLUME`) with symbol
 *     predicates (`>`, `BETWEEN`); see the `trading://scanner-filter-specs` MCP
 *     resource. There is **no price-vs-SMA filter**, so the old "above the
 *     50/200-day" gates aren't expressible — a market-cap floor replaces them.
 *   - A result row is `{ ticker, instrument_id, instrument_type, columns }`
 *     where `columns` is a map of **display-name → pre-formatted STRING** (values
 *     can be scientific notation, e.g. market cap `"1.34e+11"`). Only the columns
 *     the scan filters on / shows are present, so most of our optional fields are
 *     often null — that's fine: the symbol is what we need (every candidate
 *     re-prices via Alpaca on analyze).
 *
 * So the bridge allow-lists the scan-management **family** (`get_scans`,
 * `create_scan`, `update_scan_filters`, `run_scan`) — all read-only market-data
 * tools, none of which place an order — and asks the model to reuse one saved
 * "scratch" scan (update its filters + run) so it doesn't accumulate saved scans.
 * The tool name(s) are overridable via `ROBINHOOD_SCANNER_TOOL` for resilience.
 * None of {@link FORBIDDEN_TOOLS} may ever appear in the allow-list.
 */

const run = promisify(execFile);

/** The primary scanner MCP tool name (the one that returns live results).
 *  Overridable via env. Must never be one of {@link FORBIDDEN_TOOLS}. */
export const SCANNER_TOOL = process.env.ROBINHOOD_SCANNER_TOOL || "run_scan";

/** The scan-management tool family the bridge allow-lists. Running an ad-hoc
 *  filtered scan needs more than `run_scan` alone (which only takes a saved
 *  `scan_id`): the model lists scans (`get_scans`), creates one (`create_scan`),
 *  replaces its filters (`update_scan_filters`), and runs it (`run_scan`). All
 *  are read-only market-data / scan-management tools — NONE places an order. The
 *  primary {@link SCANNER_TOOL} is always included even if overridden. */
export const SCANNER_TOOLS: readonly string[] = Array.from(
  new Set([SCANNER_TOOL, "get_scans", "create_scan", "update_scan_filters", "run_scan"]),
);

/** Stable titles for the reusable "scratch" scans the bridge maintains, so
 *  repeated runs reuse one saved scan per mode instead of piling up new ones.
 *  Two modes because the live tool can't combine the upcoming-earnings preset
 *  with custom filters (custom filters REPLACE a preset), and the raw
 *  `FILTER_TYPE_EARNINGS_DATE` filter returns no matches — the working path for
 *  "earnings soon" is Robinhood's native `UPCOMING_EARNINGS` preset, narrowed by
 *  the result's "Earnings date" column (a YYYYMMDD integer). */
const SCRATCH_SCAN_TITLE = "Trading Desk — scratch scan (auto)";
const EARNINGS_SCAN_TITLE = "Trading Desk — earnings scan (auto)";

/** Feature flag — the scanner is OFF until explicitly enabled (and the tool name
 *  confirmed against the live MCP). */
export function isScannerEnabled(): boolean {
  const v = process.env.SCANNER_ENABLED;
  return v === "1" || v === "true";
}

/** Fully-namespaced MCP tool id (`mcp__<server>__<tool>`). */
function toolId(tool: string): string {
  return `mcp__${ROBINHOOD_MCP_SERVER}__${tool}`;
}

/** How long to wait for the scanner CLI read before giving up. */
const CLI_TIMEOUT_MS = 90_000;

/**
 * Translate our {@link ScanFilters} into Robinhood `FILTER_TYPE_*` filter specs
 * (the wire format `create_scan` / `update_scan_filters` expect). Returns a
 * human-readable, copy-pasteable description for the CLI prompt — the model
 * builds the actual filter payload from these. Predicates use the symbol form
 * (`>`, `BETWEEN`) per the `trading://scanner-filter-specs` resource. Earnings
 * is NOT expressed here (the raw earnings-date filter returns no matches) — the
 * earnings path uses the `UPCOMING_EARNINGS` preset instead.
 */
function describeFilters(f: ScanFilters): string {
  const specs: string[] = [];
  if (f.rsiMin !== null && f.rsiMax !== null) {
    specs.push(
      `{filter_type:"FILTER_TYPE_RSI", predicate:"BETWEEN", values:["${f.rsiMin}","${f.rsiMax}"], interval:"1d", length:14}`,
    );
  } else if (f.rsiMin !== null) {
    specs.push(
      `{filter_type:"FILTER_TYPE_RSI", predicate:">=", values:["${f.rsiMin}"], interval:"1d", length:14}`,
    );
  } else if (f.rsiMax !== null) {
    specs.push(
      `{filter_type:"FILTER_TYPE_RSI", predicate:"<=", values:["${f.rsiMax}"], interval:"1d", length:14}`,
    );
  }
  if (f.minRelativeVolume !== null) {
    specs.push(
      `{filter_type:"FILTER_TYPE_RELATIVE_VOLUME", predicate:">", values:["${f.minRelativeVolume}"], interval:"1d"}`,
    );
  }
  if (f.minMarketCap !== null) {
    specs.push(
      `{filter_type:"FILTER_TYPE_MARKET_CAP", predicate:">", values:["${Math.round(
        f.minMarketCap,
      )}"]}`,
    );
  }
  return specs.length ? specs.join(", ") : "(no filters — a broad market scan)";
}

/** The shared "emit ONLY our minified JSON array" output contract, appended to
 *  both prompt modes so the contract stays identical. */
function outputContract(limit: number): string {
  return [
    `Then output ONLY a single minified JSON ARRAY — no prose, no markdown fences — of up to ${limit} objects, copying values verbatim from each row (never compute, estimate, or invent a value; use null for any column the row does not have):`,
    `[{"symbol":TICKER_STRING,"sector":STRING_OR_NULL,"price":LAST_NUMBER_OR_NULL,` +
      `"rsi":NUMBER_OR_NULL,"relative_volume":NUMBER_OR_NULL,` +
      `"earnings_date":STRING_OR_NULL,"market_cap":NUMBER_OR_NULL,` +
      `"pe_ratio":NUMBER_OR_NULL}]`,
    `Map: symbol<-ticker (or the "Symbol" column), price<-"Last" column, rsi<-"RSI", relative_volume<-"Relative volume", market_cap<-"Market cap", pe_ratio<-"P/E". Numeric strings (including scientific notation like "1.34e+11") are fine — copy them as numbers; null when the column is absent.`,
  ].join(" ");
}

const SAFETY_PREAMBLE = [
  `Do NOT call get_accounts, do NOT read any brokerage account, do NOT place or cancel any order (equity or option). This places nothing.`,
];

/** Filter-mode prompt (trend / value / custom): one reusable scratch scan whose
 *  `FILTER_TYPE_*` filters we replace each run. */
function buildFilterPrompt(filters: ScanFilters): string {
  return [
    `Use the ${ROBINHOOD_MCP_SERVER} MCP for READ-ONLY market data only.`,
    ...SAFETY_PREAMBLE,
    `Goal: screen the US equity market and return the matching tickers.`,
    `Step 1: call get_scans. If a scan titled "${SCRATCH_SCAN_TITLE}" exists, call update_scan_filters on its scan_id with the filter set below, then run_scan on it.` +
      ` Otherwise call create_scan with preset:"INITIAL", title:"${SCRATCH_SCAN_TITLE}", and the filter set below (create_scan returns the initial results).`,
    `Filter set: [${describeFilters(filters)}].`,
    `Step 2: from the scan result rows, keep up to ${filters.limit} equities (instrument_type EQUITY/STOCK; skip ETFs and non-equities). Each row has a "ticker" and a "columns" map (column display-name -> string value).`,
    `Step 3: ${outputContract(filters.limit)}`,
  ].join(" ");
}

/** Earnings-mode prompt: the raw earnings-date filter returns no matches, so use
 *  Robinhood's native `UPCOMING_EARNINGS` preset and narrow client-side by the
 *  "Earnings date" column (a YYYYMMDD integer, e.g. 20260707 = 2026-07-07). */
function buildEarningsPrompt(filters: ScanFilters): string {
  const days = filters.earningsWithinDays ?? 14;
  const capLine =
    filters.minMarketCap !== null
      ? ` AND a "Market cap" column value >= ${Math.round(filters.minMarketCap)}`
      : "";
  const relVolLine =
    filters.minRelativeVolume !== null
      ? ` AND a "Relative volume" column value >= ${filters.minRelativeVolume}`
      : "";
  return [
    `Use the ${ROBINHOOD_MCP_SERVER} MCP for READ-ONLY market data only.`,
    ...SAFETY_PREAMBLE,
    `Goal: find US equities with EARNINGS within the next ${days} days.`,
    `Step 1: call get_scans. If a scan titled "${EARNINGS_SCAN_TITLE}" exists, call run_scan on its scan_id.` +
      ` Otherwise call create_scan with preset:"UPCOMING_EARNINGS" and title:"${EARNINGS_SCAN_TITLE}" (it returns the upcoming-earnings universe with an "Earnings date" column).`,
    `Step 2: each row's "Earnings date" column is a YYYYMMDD integer (e.g. 20260707 means 2026-07-07). Using today's real date, keep up to ${filters.limit} equities (instrument_type EQUITY/STOCK; skip ETFs and non-equities) whose earnings date is from today through ${days} days from today${capLine}${relVolLine}.`,
    `Step 3: ${outputContract(filters.limit)} For earnings_date, convert the YYYYMMDD integer to an ISO "YYYY-MM-DD" string (20260707 -> "2026-07-07").`,
  ].join(" ");
}

/**
 * Build the `claude -p` argv that runs the scanner through the host CLI. Pure +
 * exported so the safety invariants are unit-tested without spawning: ONLY the
 * scan-management tools are allow-listed, every order/enumeration tool is
 * explicitly disallowed, and NO brokerage account is referenced (this is market
 * data). The model reuses one saved "scratch" scan per mode so it doesn't
 * accumulate saved scans on the account.
 */
export function buildScannerCliCommand(filters: ScanFilters): {
  cmd: string;
  args: string[];
} {
  const prompt =
    filters.earningsWithinDays !== null
      ? buildEarningsPrompt(filters)
      : buildFilterPrompt(filters);

  return {
    cmd: "claude",
    args: [
      "-p",
      prompt,
      // Least privilege: only the scan-management family — never an order tool.
      "--allowedTools",
      ...SCANNER_TOOLS.map(toolId),
      "--disallowedTools",
      ...FORBIDDEN_TOOLS.map(toolId),
    ],
  };
}

/** Pull the first balanced JSON array out of CLI stdout (the model is asked for
 *  a bare array, but tolerate stray prose / code fences defensively). */
function extractJsonArray(text: string): unknown {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("scanner CLI read returned no JSON array");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// External data is untrusted — coerce defensively, strip unknown keys, and never
// throw on a single bad row (drop it instead). Robinhood returns column cells as
// pre-formatted STRINGS (incl. scientific notation), and rows are keyed by
// `ticker`, so we accept both number- and string-valued fields and a `ticker`
// alias for the symbol. We instruct the model to emit our clean shape, but stay
// robust if it copies the raw cells verbatim.
const numLike = z.union([z.number(), z.string()]).nullish();
const RhScanRowSchema = z
  .object({
    symbol: z.string().nullish(),
    ticker: z.string().nullish(),
    sector: z.string().nullish(),
    price: numLike,
    rsi: numLike,
    relative_volume: numLike,
    earnings_date: z.string().nullish(),
    market_cap: numLike,
    pe_ratio: numLike,
  })
  .passthrough();

/** Coerce a number-or-numeric-string (incl. "1.34e+11") to a finite number, else
 *  null. Empty / non-numeric strings → null (never a spurious 0). */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  return s.length ? s : null;
}

/**
 * Map a validated scanner payload into our {@link ScanResult}[]. Invalid symbols
 * and unparseable rows are dropped; results are deduped by symbol and capped to
 * `filters.limit`. Pure + exported so the coercion is unit-tested.
 */
export function mapScannerResults(raw: unknown, limit: number): ScanResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ScanResult[] = [];
  for (const row of raw) {
    const parsed = RhScanRowSchema.safeParse(row);
    if (!parsed.success) continue;
    const rawSymbol = parsed.data.symbol ?? parsed.data.ticker;
    if (!rawSymbol) continue;
    const symbol = normalizeSymbol(rawSymbol);
    if (!isValidSymbol(symbol) || seen.has(symbol)) continue;
    seen.add(symbol);
    out.push({
      symbol,
      sector: str(parsed.data.sector),
      price: num(parsed.data.price),
      rsi: num(parsed.data.rsi),
      relativeVolume: num(parsed.data.relative_volume),
      earningsDate: str(parsed.data.earnings_date),
      marketCap: num(parsed.data.market_cap),
      peRatio: num(parsed.data.pe_ratio),
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** A scanner fetch seam (default spawns the CLI). Injected so the orchestrator
 *  is unit-tested without the CLI. */
export type ScanFetcher = (filters: ScanFilters) => Promise<unknown>;

/** Default scan: spawn the host `claude` CLI to run the scanner through its
 *  authenticated MCP session. Throws on timeout / non-zero exit / no JSON. */
const defaultRunScan: ScanFetcher = async (filters) => {
  const { cmd, args } = buildScannerCliCommand(filters);
  const { stdout } = await run(cmd, args, {
    cwd: process.cwd(),
    timeout: CLI_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  return extractJsonArray(stdout);
};

/** Thrown when the scanner can't run (flag off / not connected). Lets the route
 *  map to the right status code. */
export class ScannerUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: "disabled" | "disconnected",
  ) {
    super(message);
    this.name = "ScannerUnavailableError";
  }
}

/**
 * Run a market scan and return the mapped, capped results. Gated on the feature
 * flag AND a live Robinhood connection. The fetch seam defaults to the CLI spawn
 * but is injectable for tests.
 */
export async function runScan(
  filters: ScanFilters,
  opts?: { fetch?: ScanFetcher },
): Promise<ScanResult[]> {
  if (!isScannerEnabled()) {
    throw new ScannerUnavailableError(
      "The market scanner is disabled. Set SCANNER_ENABLED once the scanner tool name is confirmed against the live MCP.",
      "disabled",
    );
  }
  if (!hasRobinhoodConnection()) {
    throw new ScannerUnavailableError(
      "No Robinhood Agentic account is connected — the scanner reads through the host CLI's MCP session.",
      "disconnected",
    );
  }
  const fetch = opts?.fetch ?? defaultRunScan;
  const raw = await fetch(filters);
  return mapScannerResults(raw, filters.limit);
}
