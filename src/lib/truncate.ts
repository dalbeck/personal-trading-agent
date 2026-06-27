/**
 * Word-boundary text truncation (catalyst-extraction-quality M2). Cutting prose
 * with a blind `.slice(0, n)` chops mid-word ("…Information Te"), which reads as
 * broken data. This truncates on the last whole word within the budget and adds
 * a single ellipsis — so a clipped thesis / research / catalyst always ends on a
 * real word. Pure + unit-tested.
 */

const ELLIPSIS = "…";

/**
 * Truncate `text` to at most `max` visible characters, breaking on the last word
 * boundary and appending an ellipsis. Returns the (trimmed) text unchanged when
 * it already fits. A single over-long word with no break point is hard-cut.
 */
export function truncateOnWord(text: string, max: number): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length <= max) return trimmed;

  const window = trimmed.slice(0, max);
  const lastSpace = window.lastIndexOf(" ");
  // Break on the last word unless that throws away almost everything (a single
  // long word) — then hard-cut at the budget.
  const body = lastSpace > 0 ? window.slice(0, lastSpace) : window;
  return body.replace(/[\s.,;:–—-]+$/, "") + ELLIPSIS;
}
