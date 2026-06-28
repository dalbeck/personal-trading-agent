/**
 * Pure parsing helpers that turn the Perplexity Agent API's free-form message
 * text into the structured profile / fundamentals / consensus fields the
 * Perplexity-style symbol layout renders. The model is asked to append a fenced
 * ```json block (see `perplexity.ts`); we extract it, strip it from the prose
 * summary, and coerce each field defensively — anything missing or unparseable
 * becomes `null` so the UI shows "—" rather than fabricating a value.
 *
 * No side effects, no `server-only` — unit-tested directly (`parse.test.ts`).
 */

import type { CashFlowQuality, DividendSignals } from "@/lib/types";
import type {
  EarningsQuarter,
  ResearchConsensus,
  ResearchFundamentals,
  ResearchProfile,
} from "./types";

const NULLISH = /^(n\/?a|—|-|–|unknown|null|none|tbd)$/i;

/** A number from a number or a numeric-ish string ("$11.93", "1,234.5"). */
export function coerceNumberLike(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || NULLISH.test(trimmed)) return null;
  const cleaned = trimmed.replace(/[$,\s%]/g, "");
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** A USD figure, expanding magnitude suffixes ("3.1T" → 3.1e12, "245B" → 245e9). */
export function coerceMoneyLike(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase();
  if (!s || NULLISH.test(s)) return null;
  const m = s.match(/-?\d[\d,]*\.?\d*/);
  if (!m) return null;
  const base = Number.parseFloat(m[0].replace(/,/g, ""));
  if (!Number.isFinite(base)) return null;
  const after = s.slice(m.index! + m[0].length).trim();
  let mult = 1;
  if (after.startsWith("t") || after.includes("trillion")) mult = 1e12;
  else if (after.startsWith("b") || after.includes("billion")) mult = 1e9;
  else if (after.startsWith("m") || after.includes("million")) mult = 1e6;
  else if (after.startsWith("k") || after.includes("thousand")) mult = 1e3;
  return base * mult;
}

/**
 * A dividend yield stored as a **fraction** (0.0072 === 0.72%). A percent
 * string ("0.72%") and a bare number (0.72) are both read as a percent value
 * and divided by 100, so the display layer can render it with `formatPercent`.
 */
export function coercePercentLike(value: unknown): number | null {
  if (value == null) return null;
  const n = coerceNumberLike(value);
  return n === null ? null : n / 100;
}

/** An integer (head-count, analyst count): rounds and strips separators. */
export function coerceIntLike(value: unknown): number | null {
  const n = coerceNumberLike(value);
  return n === null ? null : Math.round(n);
}

/** A trimmed string, or null for empty / sentinel-nullish values. */
export function coerceStr(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || NULLISH.test(s)) return null;
  return s;
}

/**
 * Pull a fenced ```json block (or a trailing bare `{…}` object) out of the
 * message text. Returns the parsed value (or null if absent/unparseable) and
 * the prose with the block removed. Never throws.
 */
export function extractJsonBlock(text: string): {
  json: unknown | null;
  cleaned: string;
} {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    const cleaned = text.replace(fence[0], "").trim();
    try {
      return { json: JSON.parse(fence[1].trim()), cleaned };
    } catch {
      return { json: null, cleaned };
    }
  }
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      const json = JSON.parse(text.slice(first, last + 1));
      const cleaned = (text.slice(0, first) + text.slice(last + 1)).trim();
      return { json, cleaned };
    } catch {
      return { json: null, cleaned: text };
    }
  }
  return { json: null, cleaned: text };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** The structured-block keys the model is asked to emit — used to tell a real
 *  (but truncated) JSON block apart from a plain prose answer. */
const STRUCTURED_KEYS =
  /"(profile|fundamentals|consensus|earnings|catalysts|cashFlow|dividend)"/;

/**
 * Was a structured JSON block *opened* in this text? True when a ```json fence
 * is present OR a `{` is followed by one of our expected keys — i.e. the model
 * started emitting the schema, even if the closing brace/fence never arrived.
 * This is what distinguishes a **truncated** response (block opened, unparseable)
 * from a legitimate prose-only one (no block at all). (research-output-completes M1)
 */
export function hasStructuredJsonOpening(text: string): boolean {
  if (/```json/i.test(text)) return true;
  const first = text.indexOf("{");
  return first !== -1 && STRUCTURED_KEYS.test(text.slice(first));
}

/**
 * Best-effort company name from a profile blurb — the leading proper-noun run
 * before a common connector verb ("Apple, Inc. engages in…" → "Apple, Inc.";
 * "GE Aerospace is an American…" → "GE Aerospace"). Conservative: returns null
 * when no connector is found or the candidate is implausibly long.
 */
export function companyNameFromDescription(desc: string | null): string | null {
  if (!desc) return null;
  const connectors = [
    " engages ",
    " is ",
    " operates ",
    " develops ",
    " designs ",
    " provides ",
    " manufactures ",
    " produces ",
    " offers ",
    " together with ",
    " through ",
    " owns ",
  ];
  let cut = -1;
  for (const c of connectors) {
    const i = desc.indexOf(c);
    if (i !== -1 && (cut === -1 || i < cut)) cut = i;
  }
  if (cut <= 0) return null;
  const name = desc.slice(0, cut).trim();
  return name.length > 0 && name.length <= 60 ? name : null;
}

/** Normalize a website/domain to a bare host ("https://www.apple.com/x" →
 *  "apple.com"). Returns null when it doesn't look like a domain. */
export function coerceDomain(value: unknown): string | null {
  const s = coerceStr(value);
  if (!s) return null;
  const host = s
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    .trim();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
}

function coerceProfile(raw: unknown): ResearchProfile | null {
  const p = asRecord(raw);
  if (!p) return null;
  return {
    name: coerceStr(p.name),
    domain: coerceDomain(p.domain),
    ceo: coerceStr(p.ceo),
    employees: coerceIntLike(p.employees),
    sector: coerceStr(p.sector),
    industry: coerceStr(p.industry),
    country: coerceStr(p.country),
    exchange: coerceStr(p.exchange),
    ipoDate: coerceStr(p.ipoDate),
    description: coerceStr(p.description),
  };
}

function coerceFundamentals(raw: unknown): ResearchFundamentals | null {
  const f = asRecord(raw);
  if (!f) return null;
  return {
    marketCap: coerceMoneyLike(f.marketCap),
    peRatio: coerceNumberLike(f.peRatio),
    eps: coerceNumberLike(f.eps),
    dividendYield: coercePercentLike(f.dividendYield),
  };
}

/**
 * Coerce the catalyst list — short phrases the card renders as chips. Accepts an
 * array of strings (or a single string), trims, drops empties/sentinels, dedupes
 * case-insensitively, and caps the count so the chip row stays scannable.
 */
export function coerceCatalysts(raw: unknown, max = 6): string[] {
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? [raw]
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const s = coerceStr(item);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Coerce one reported quarter for the earnings strip. `surprise`/`priceMove` are
 * read as percent values and stored as **fractions**; `beat` is taken when given,
 * else computed from actual-vs-estimate. Returns null when there is no usable
 * period or EPS data, so a junk row never reaches the strip.
 */
function coerceEarningsQuarter(raw: unknown): EarningsQuarter | null {
  const q = asRecord(raw);
  if (!q) return null;
  const period = coerceStr(q.period ?? q.quarter ?? q.date ?? q.fiscalPeriod);
  const epsActual = coerceNumberLike(q.epsActual ?? q.actual ?? q.reported);
  const epsEstimate = coerceNumberLike(
    q.epsEstimate ?? q.estimate ?? q.consensus ?? q.expected,
  );
  if (!period && epsActual === null && epsEstimate === null) return null;

  let surprisePct = coercePercentLike(q.surprisePct ?? q.surprise);
  if (
    surprisePct === null &&
    epsActual !== null &&
    epsEstimate !== null &&
    epsEstimate !== 0
  ) {
    surprisePct = (epsActual - epsEstimate) / Math.abs(epsEstimate);
  }

  const priceMovePct = coercePercentLike(
    q.priceMovePct ?? q.priceMove ?? q.postEarningsMove ?? q.move,
  );

  const beatRaw = q.beat;
  let beat: boolean | null = typeof beatRaw === "boolean" ? beatRaw : null;
  if (beat === null && epsActual !== null && epsEstimate !== null) {
    beat = epsActual >= epsEstimate;
  }

  return {
    period: period ?? "—",
    epsActual,
    epsEstimate,
    surprisePct,
    priceMovePct,
    beat,
  };
}

/** Coerce the recent-quarters array for the earnings strip (most recent last). */
export function coerceEarnings(raw: unknown, max = 4): EarningsQuarter[] {
  if (!Array.isArray(raw)) return [];
  const out: EarningsQuarter[] = [];
  for (const item of raw) {
    const q = coerceEarningsQuarter(item);
    if (q) out.push(q);
  }
  return out.slice(-max);
}

/** Map a free-text trend word to the constrained FCF trend, or null. */
const FCF_TREND_SYNONYMS: Record<string, CashFlowQuality["fcfTrend"]> = {
  growing: "growing",
  rising: "growing",
  improving: "growing",
  increasing: "growing",
  up: "growing",
  expanding: "growing",
  stable: "stable",
  flat: "stable",
  steady: "stable",
  declining: "declining",
  falling: "declining",
  deteriorating: "declining",
  decreasing: "declining",
  down: "declining",
  shrinking: "declining",
};

function coerceFcfTrend(value: unknown): CashFlowQuality["fcfTrend"] {
  const s = coerceStr(value);
  if (!s) return null;
  return FCF_TREND_SYNONYMS[s.toLowerCase()] ?? null;
}

/**
 * Coerce the cash-flow quality block (value-cashflow M1) — the floor-vs-trap
 * signal for the value lens. Money figures expand magnitude suffixes; `fcfYield`
 * is a fraction (and is **derived** from `freeCashFlow ÷ marketCap` when the
 * model didn't give one but a market cap is available); `fcfTrend` is normalized
 * to growing/stable/declining. Returns null when there is no usable figure, so
 * the proposal carries `cashFlow: null` (and the UI renders "—") rather than an
 * all-null husk.
 */
export function coerceCashFlow(
  raw: unknown,
  opts?: { marketCap?: number | null },
): CashFlowQuality | null {
  const cf = asRecord(raw);
  if (!cf) return null;

  const freeCashFlow = coerceMoneyLike(cf.freeCashFlow);
  let fcfYield = coercePercentLike(cf.fcfYield);
  const marketCap = opts?.marketCap ?? null;
  if (
    fcfYield === null &&
    freeCashFlow !== null &&
    marketCap !== null &&
    marketCap > 0
  ) {
    fcfYield = freeCashFlow / marketCap;
  }

  const result: CashFlowQuality = {
    operatingCashFlow: coerceMoneyLike(cf.operatingCashFlow),
    freeCashFlow,
    fcfTrend: coerceFcfTrend(cf.fcfTrend),
    fcfYield,
    netDebt: coerceMoneyLike(cf.netDebt),
    debtToEquity: coerceNumberLike(cf.debtToEquity),
    interestCoverage: coerceNumberLike(cf.interestCoverage),
  };

  // No usable figure → null (so `cashFlow` reads as absent, not all-null).
  const hasAny = Object.values(result).some((v) => v !== null);
  return hasAny ? result : null;
}

/**
 * Coerce the dividend-sustainability block (dividend-floor M1) — the value lens's
 * floor tell. Percent fields (`dividendYield` / `payoutRatio` / `fcfPayout` /
 * `dividendCagr`) read as fractions; `fcfCoverage` is a multiple. The two
 * coverage views are mutually derived (coverage ↔ 1/payout) so whichever the
 * model gives, both are populated; `dividendYield` falls back to the parsed
 * fundamentals yield. Returns null when there is no usable figure.
 */
export function coerceDividend(
  raw: unknown,
  opts?: { dividendYield?: number | null },
): DividendSignals | null {
  const d = asRecord(raw);
  if (!d) return null;

  let fcfPayout = coercePercentLike(d.fcfPayout);
  let fcfCoverage = coerceNumberLike(d.fcfCoverage);
  if (fcfCoverage === null && fcfPayout !== null && fcfPayout > 0) {
    fcfCoverage = 1 / fcfPayout;
  }
  if (fcfPayout === null && fcfCoverage !== null && fcfCoverage > 0) {
    fcfPayout = 1 / fcfCoverage;
  }

  const result: DividendSignals = {
    dividendYield: coercePercentLike(d.dividendYield) ?? opts?.dividendYield ?? null,
    payoutRatio: coercePercentLike(d.payoutRatio),
    fcfPayout,
    fcfCoverage,
    growthStreakYears: coerceIntLike(d.growthStreakYears),
    dividendCagr: coercePercentLike(d.dividendCagr),
  };

  const hasAny = Object.values(result).some((v) => v !== null);
  return hasAny ? result : null;
}

// ---------------------------------------------------------------------------
// Prose / finance_results extraction (perplexity-cashflow-extraction M3)
//
// The Agent API's `finance_search` is unreliable about emitting a clean JSON
// block: the structured `finance_results` content is often empty, and the real
// figures land in the model's PROSE ("Operating Cash Flow (TTM): $114.4
// billion … Free Cash Flow: ~$83.0 billion … Net Debt: $50.3 billion"). So when
// the JSON block lacks cashFlow/dividend, recover the labeled figures from the
// finance_results content + prose rather than depending solely on the JSON echo.
// Best-effort: no labeled figure → null → the caller falls through to FMP.
// ---------------------------------------------------------------------------

/** A money token in prose: "$114.4 billion", "83.0B", "$50.3 billion". Requires
 *  a `$` and/or a magnitude word so bare integers/years aren't matched. */
const PROSE_MONEY =
  String.raw`(\$\s?-?\d[\d,]*(?:\.\d+)?\s*(?:trillion|billion|million|thousand|[TBMK])?|-?\d[\d,]*(?:\.\d+)?\s*(?:trillion|billion|million|thousand)\b|-?\d[\d,]*(?:\.\d+)?\s?[TBMK]\b)`;

/** Find the first money figure that follows `label` within the same sentence. */
function findLabeledMoney(text: string, label: string): string | null {
  const re = new RegExp(
    `${label}[^.\\n]{0,80}?${PROSE_MONEY}`,
    "i",
  );
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

/** Find the first percent figure that follows `label` within the same sentence. */
function findLabeledPercent(text: string, label: string): string | null {
  const re = new RegExp(
    `${label}[^.\\n]{0,80}?(-?\\d[\\d,]*(?:\\.\\d+)?)\\s*(?:%|percent)`,
    "i",
  );
  const m = text.match(re);
  return m ? `${m[1].trim()}%` : null;
}

/**
 * Pull cash-flow money figures out of free text (finance_results content +
 * prose). Returns a raw object suitable for `coerceCashFlow`, or null when no
 * labeled figure is present. Only the money lines are extracted here; fcfYield
 * is derived downstream from freeCashFlow + market cap by `coerceCashFlow`.
 */
export function extractCashFlowFromText(text: string): {
  operatingCashFlow: string | null;
  freeCashFlow: string | null;
  netDebt: string | null;
} | null {
  if (!text) return null;
  const operatingCashFlow = findLabeledMoney(text, "operating cash flow");
  const freeCashFlow = findLabeledMoney(text, "free cash flow");
  const netDebt = findLabeledMoney(text, "net debt");
  if (operatingCashFlow === null && freeCashFlow === null && netDebt === null) {
    return null;
  }
  return { operatingCashFlow, freeCashFlow, netDebt };
}

/**
 * Pull dividend percentages out of free text. Returns a raw object suitable for
 * `coerceDividend`, or null when neither a dividend yield nor a payout ratio is
 * labeled. fcfCoverage/streak are not reliably stated in prose, so they stay
 * null (FMP supplies them when available).
 */
export function extractDividendFromText(text: string): {
  dividendYield: string | null;
  payoutRatio: string | null;
} | null {
  if (!text) return null;
  const dividendYield = findLabeledPercent(text, "dividend yield");
  const payoutRatio = findLabeledPercent(text, "payout ratio");
  if (dividendYield === null && payoutRatio === null) return null;
  return { dividendYield, payoutRatio };
}

function coerceConsensus(raw: unknown): ResearchConsensus | null {
  const c = asRecord(raw);
  if (!c) return null;
  return {
    rating: coerceStr(c.rating),
    targetMean: coerceNumberLike(c.targetMean),
    targetHigh: coerceNumberLike(c.targetHigh),
    targetLow: coerceNumberLike(c.targetLow),
    analystCount: coerceIntLike(c.analystCount),
  };
}

/**
 * Parse the structured JSON block out of a Perplexity message, returning the
 * three coerced field groups (null when absent) and the prose summary with the
 * JSON block stripped. Defensive: malformed JSON yields all-null + the cleaned
 * prose, never an exception.
 */
export function parseStructuredResearch(text: string): {
  profile: ResearchProfile | null;
  fundamentals: ResearchFundamentals | null;
  consensus: ResearchConsensus | null;
  earnings: EarningsQuarter[];
  catalysts: string[];
  cashFlow: CashFlowQuality | null;
  dividend: DividendSignals | null;
  summary: string;
  /** Whether the structured JSON block parsed (research-output-completes M1):
   *  - `ok`        — a block parsed cleanly.
   *  - `parse-error` — a block was opened (```json fence / `{"profile"…`) but is
   *    unparseable, i.e. **truncated** (the LLY `max_output_tokens` failure) or
   *    malformed. The caller should treat this as a soft failure → trigger FMP,
   *    never cache it as a clean success.
   *  - `missing`   — no structured block at all (a legitimate prose-only answer). */
  jsonStatus: "ok" | "missing" | "parse-error";
} {
  const { json, cleaned } = extractJsonBlock(text);
  const obj = asRecord(json);
  const fundamentals = obj ? coerceFundamentals(obj.fundamentals) : null;
  const jsonStatus: "ok" | "missing" | "parse-error" = obj
    ? "ok"
    : hasStructuredJsonOpening(text)
      ? "parse-error"
      : "missing";
  return {
    jsonStatus,
    profile: obj ? coerceProfile(obj.profile) : null,
    fundamentals,
    consensus: obj ? coerceConsensus(obj.consensus) : null,
    earnings: obj ? coerceEarnings(obj.earnings) : [],
    catalysts: obj ? coerceCatalysts(obj.catalysts) : [],
    // Derive FCF yield from the same block's market cap when the model didn't
    // give one — the parser stays the single source of the yield math.
    cashFlow: obj
      ? coerceCashFlow(obj.cashFlow, { marketCap: fundamentals?.marketCap })
      : null,
    // Dividend signals fall back to the fundamentals yield when the block omits it.
    dividend: obj
      ? coerceDividend(obj.dividend, { dividendYield: fundamentals?.dividendYield })
      : null,
    summary: cleaned,
  };
}
