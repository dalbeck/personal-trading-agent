/**
 * Turn the Perplexity `finance_search` finance_results blocks into typed,
 * scaffolding-stripped sections for the "View full financials & transcript"
 * expander. The tool emits its own meta noise around the real tables — quote
 * field guides, column legends, row-key notes, and "Data available in: …csv"
 * references. None of that may reach the UI, so we strip it here (server-side)
 * before the payload is cached or rendered.
 *
 * Pure, no side effects, no `server-only` — unit-tested directly
 * (`sections.test.ts`).
 */

import type {
  FinanceSection,
  FinanceSectionKind,
  ResearchFinanceResult,
} from "./types";

/**
 * Markers that open a multi-line scaffolding block (a header followed by
 * definition lines). When a line matches, we drop it and every following line
 * until the next blank line.
 */
const BLOCK_HEADER = [
  /\bquote field guide\b/i,
  /\bfield guide\b/i,
  /\bcolumn legend\b/i,
  /^\s*legend\b/i,
  /\brow[-\s]?key(s)?\b/i,
  /^\s*key:/i,
];

/** Markers that kill a single line wherever it appears (CSV refs, data notes). */
const LINE_NOISE = [
  /\bdata available in\b/i,
  /\.csv\b/i,
  /^\s*csv\b/i,
  /\bcsv (file|reference|export)\b/i,
  /\b[\w-]+_(quotes|financials|earnings|income|balance|cashflow|transcript)_[\w.-]*\b/i,
];

/**
 * Remove the tool's field guides, column legends, row-key notes, and CSV
 * references from a finance_results markdown block, returning clean markdown.
 * Collapses the blank-line runs left behind. Never throws.
 */
export function stripScaffolding(content: string): string {
  if (!content) return "";
  const lines = content.split(/\r?\n/);
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    const blank = line.trim() === "";

    if (skipping) {
      // A blank line closes the scaffolding block; the blank itself is dropped.
      if (blank) skipping = false;
      continue;
    }

    if (BLOCK_HEADER.some((re) => re.test(line))) {
      skipping = true;
      continue;
    }

    if (!blank && LINE_NOISE.some((re) => re.test(line))) continue;

    kept.push(line);
  }

  // Collapse 3+ blank lines to one, then trim leading/trailing whitespace.
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const KIND_TITLE: Record<FinanceSectionKind, string> = {
  quote: "Quote",
  profile: "Company profile",
  financials: "Financials",
  earnings: "Earnings history",
  transcript: "Earnings call transcript",
  other: "Additional data",
};

/** Classify a finance_results block from its category tags (and content). */
export function sectionKind(categories: string[], content: string): FinanceSectionKind {
  // Normalize separators so "income_statement" / "earnings-history" match.
  const hay = `${categories.join(" ")} ${content}`
    .toLowerCase()
    .replace(/[_-]/g, " ");
  if (/\btranscript\b/.test(hay)) return "transcript";
  if (/\bearnings\b/.test(hay)) return "earnings";
  if (/\b(financials?|income|balance|cash[_\s-]?flow|cashflow|statement)\b/.test(hay))
    return "financials";
  if (/\bprofile\b/.test(hay)) return "profile";
  if (/\bquote\b/.test(hay)) return "quote";
  return "other";
}

/**
 * Build the typed, scaffolding-stripped sections for the expander. Blocks whose
 * content is pure scaffolding (nothing left after stripping) are dropped, so the
 * UI never shows an empty header.
 */
export function buildFinanceSections(
  finance: ResearchFinanceResult[],
): FinanceSection[] {
  const out: FinanceSection[] = [];
  for (const block of finance) {
    const content = stripScaffolding(block.content);
    if (!content) continue;
    const kind = sectionKind(block.categories, block.content);
    out.push({ kind, title: KIND_TITLE[kind], content, sources: block.sources });
  }
  return out;
}
