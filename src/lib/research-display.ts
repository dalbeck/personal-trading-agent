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
