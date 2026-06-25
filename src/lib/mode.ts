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

/** Live is the focus of the desk (the human-approved Robinhood account), so the
 *  dashboard opens on it. Paper is one toggle away — the dry-run sink / fallback,
 *  no longer the default. */
export const DEFAULT_VIEW_MODE: ViewMode = "live";

/** Cookie name holding the selected view mode. Readable client- and server-side. */
export const VIEW_MODE_COOKIE = "view-mode";

export const MODE_LABEL: Record<ViewMode, string> = {
  paper: "Paper",
  live: "Live",
};

/** Narrow an untrusted cookie/string value to a {@link ViewMode}. An explicit
 *  `"paper"` / `"live"` is honored; anything else resolves to
 *  {@link DEFAULT_VIEW_MODE}. */
export function parseViewMode(value: string | null | undefined): ViewMode {
  if (value === "paper") return "paper";
  if (value === "live") return "live";
  return DEFAULT_VIEW_MODE;
}

/** The other book — used to label the subtle "also running" indicator. */
export function otherMode(mode: ViewMode): ViewMode {
  return mode === "live" ? "paper" : "live";
}
