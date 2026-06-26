/**
 * Display formatters shared by server and client components. Uses a true minus
 * sign (−, U+2212) for negatives so figures align under `tabular-nums`.
 */

const MINUS = "−";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type Tone = "gain" | "loss" | "neutral";

export function toneForValue(value: number): Tone {
  if (value > 0) return "gain";
  if (value < 0) return "loss";
  return "neutral";
}

export function formatCurrency(
  value: number,
  { signed = false }: { signed?: boolean } = {},
): string {
  const body = usd.format(Math.abs(value));
  const sign = value < 0 ? MINUS : signed ? "+" : "";
  return `${sign}${body}`;
}

export function formatPercent(
  ratio: number,
  { signed = true }: { signed?: boolean } = {},
): string {
  const pct = Math.abs(ratio * 100).toFixed(2);
  const sign = ratio < 0 ? MINUS : signed ? "+" : "";
  return `${sign}${pct}%`;
}

/**
 * Split a formatted figure into a primary part and a de-emphasized trailing
 * part (the decimal/cents), for the two-tone KPI number. "+$30.49" →
 * { primary: "+$30", secondary: ".49" }. Strings without a decimal return an
 * empty `secondary`. Pure string-splitting on the last "." so it works for any
 * already-formatted currency/percent value.
 */
export function splitNumberParts(formatted: string): {
  primary: string;
  secondary: string;
} {
  const dot = formatted.lastIndexOf(".");
  if (dot === -1) return { primary: formatted, secondary: "" };
  return { primary: formatted.slice(0, dot), secondary: formatted.slice(dot) };
}

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 2,
});

const compactNum = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Compact USD for large figures: 3_100_000_000_000 → "$3.1T". */
export function formatCompactCurrency(value: number): string {
  return compactUsd.format(value);
}

/** Compact count for large figures: 228_000 → "228K". */
export function formatCompactNumber(value: number): string {
  return compactNum.format(value);
}

const COUNTRY_CODE: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  usa: "US",
  us: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  america: "US",
  china: "CN",
  japan: "JP",
  "united kingdom": "GB",
  uk: "GB",
  britain: "GB",
  germany: "DE",
  france: "FR",
  canada: "CA",
  switzerland: "CH",
  netherlands: "NL",
  ireland: "IE",
  taiwan: "TW",
  "south korea": "KR",
  korea: "KR",
  india: "IN",
  israel: "IL",
  brazil: "BR",
  australia: "AU",
  spain: "ES",
  italy: "IT",
  sweden: "SE",
  mexico: "MX",
};

/** A country name or 2-letter ISO code → uppercase ISO 3166-1 alpha-2 code
 *  (e.g. "United States" → "US"), or null when unknown. Drives the SVG flag. */
export function countryCode(country: string | null): string | null {
  if (!country) return null;
  const key = country.trim().toLowerCase();
  const code = COUNTRY_CODE[key] ?? null;
  if (code) return code;
  return /^[a-z]{2}$/.test(key) ? key.toUpperCase() : null;
}

export function formatQty(qty: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(
    qty,
  );
}

/** ISO date (YYYY-MM-DD) → "Jun 22, 2026". UTC to avoid TZ drift on date-only. */
export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** ISO datetime → "Jun 22, 2026, 9:41 AM ET" (rendered in US/Eastern). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const s = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(d);
  return `${s} ET`;
}
