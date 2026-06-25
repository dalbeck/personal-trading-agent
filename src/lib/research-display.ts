/**
 * Shared display constants for research sourcing. The raw provider tool name
 * (`finance_search`) must NEVER be rendered in the UI — every surface that shows
 * where research came from (the summary card, the symbol stats grid, analyst
 * consensus, any source chip) normalizes to this single label so the wording is
 * consistent everywhere and the tool scaffolding never leaks.
 *
 * Plain module (no `server-only`) so client and server components can both
 * import it.
 */

/** The user-facing name for the Perplexity `finance_search` research provider. */
export const RESEARCH_PROVIDER_LABEL = "Perplexity Finance";

/** Short brand tag for compact source pills (e.g. the stats-grid cell tags). */
export const RESEARCH_PROVIDER_SHORT = "Perplexity";

/**
 * Freshness display, shared client/server. Research is cached by symbol with a
 * `fetchedAt` stamp; the cache only **auto**-refetches past the soft max-age
 * (server-side, in `getSymbolResearch`). These constants drive the **display**:
 * how the age reads and when it is flagged stale (a colour/label, never an
 * auto-spend). `NEXT_PUBLIC_*` overrides keep client and server in sync.
 */
const DAY_MS = 86_400_000;

/** Age past which the freshness label is flagged stale (display-only). */
export const RESEARCH_STALE_AGE_MS =
  Number(process.env.NEXT_PUBLIC_RESEARCH_STALE_DAYS ?? 2) * DAY_MS;

/** A compact "N ago" label for an ISO timestamp, or null when absent/invalid. */
export function researchAgeLabel(
  fetchedAt: string | null,
  now: number = Date.now(),
): string | null {
  if (!fetchedAt) return null;
  const ms = now - Date.parse(fetchedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** True when cached research is old enough to flag stale (display-only). */
export function isResearchStale(
  fetchedAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!fetchedAt) return false;
  const ms = now - Date.parse(fetchedAt);
  return Number.isFinite(ms) && ms >= RESEARCH_STALE_AGE_MS;
}
