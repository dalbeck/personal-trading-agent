/**
 * Account **view mode** — which book the dashboard is currently showing.
 *
 * This is a *view switch, not an engine switch*: both the paper desk and the
 * read-only live side run concurrently regardless of which one is on screen.
 * The mode only picks which book's data context the panels render. Toggling to
 * `live` never enables trading — the two-gate order path (see
 * `.agents/infra.md`) is entirely independent of this preference.
 *
 * Plain module (no `server-only`) so the client toggle and the server readers
 * can both import the constants/helpers. Persisted in a cookie so the server
 * components render the correct book on first paint (no flash).
 */
export const VIEW_MODES = ["paper", "live"] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

/** Paper is the proving ground — the safe default before any live connection. */
export const DEFAULT_VIEW_MODE: ViewMode = "paper";

/** Cookie name holding the selected view mode. Readable client- and server-side. */
export const VIEW_MODE_COOKIE = "view-mode";

export const MODE_LABEL: Record<ViewMode, string> = {
  paper: "Paper",
  live: "Live",
};

/** Narrow an untrusted cookie/string value to a {@link ViewMode}. Anything that
 *  is not exactly `"live"` resolves to the safe default (`paper`). */
export function parseViewMode(value: string | null | undefined): ViewMode {
  return value === "live" ? "live" : DEFAULT_VIEW_MODE;
}

/** The other book — used to label the subtle "also running" indicator. */
export function otherMode(mode: ViewMode): ViewMode {
  return mode === "live" ? "paper" : "live";
}
