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
