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

import type { CashFlowQuality } from "@/lib/types";
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
  summary: string;
} {
  const { json, cleaned } = extractJsonBlock(text);
  const obj = asRecord(json);
  const fundamentals = obj ? coerceFundamentals(obj.fundamentals) : null;
  return {
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
    summary: cleaned,
  };
}
