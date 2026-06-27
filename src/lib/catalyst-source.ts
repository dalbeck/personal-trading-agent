/**
 * Display helpers for a proposal's **catalyst sources** (catalyst-news-sources
 * M1) — the headlines (headline + publisher + time) behind the named catalyst,
 * kept so the catalyst is verifiable. Shared by the proposal detail view and the
 * Markdown/PDF export so the rendering is identical everywhere. Pure +
 * unit-tested. Plain module (no `server-only`) so the client view imports it.
 */
import type { CatalystSource } from "@/lib/types";

/** A short date (YYYY-MM-DD) for a raw news timestamp, or null when unparseable
 *  / absent — the UI then simply omits the date. */
export function catalystSourceDate(source: CatalystSource): string | null {
  const ts = source.publishedAt;
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** A one-line `"Headline" — Publisher · YYYY-MM-DD` rendering of a source, for
 *  the export and any text surface. Omits the date when unparseable/absent and
 *  the publisher when blank. */
export function catalystSourceLine(source: CatalystSource): string {
  const parts: string[] = [];
  if (source.publisher.trim()) parts.push(source.publisher.trim());
  const date = catalystSourceDate(source);
  if (date) parts.push(date);
  const suffix = parts.length > 0 ? ` — ${parts.join(" · ")}` : "";
  return `"${source.headline.trim()}"${suffix}`;
}
