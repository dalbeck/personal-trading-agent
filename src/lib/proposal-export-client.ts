/**
 * Client-side export helpers for the proposal detail page (proposal-export-actions
 * M2) — **Copy Markdown** + **Export JSON**, additive to the existing
 * Export PDF / Export Markdown downloads (which are unchanged).
 *
 * - **Copy Markdown** reuses the SAME server route the Markdown *download* uses
 *   (`?format=md`) and writes its body to the clipboard, so the copied text is
 *   byte-for-byte identical to the file — the markdown generator is never forked.
 * - **Export JSON** serializes the **raw proposal object** (the canonical stored
 *   shape) so the download round-trips against `TradeProposalSchema`.
 *
 * Plain module (no `server-only`, no DOM at import time) so the client component
 * imports it and the seams (`fetch` / `clipboard`) are injectable for unit tests.
 */
import type { TradeProposal } from "@/lib/types";

/** The existing Markdown-export route — the single source of the markdown text,
 *  shared by the download link and the Copy action. */
export function markdownExportUrl(id: string): string {
  return `/api/proposals/${encodeURIComponent(id)}/export?format=md`;
}

/** The PDF-export route (unchanged) — kept here so the card builds both links
 *  from one place. */
export function pdfExportUrl(id: string): string {
  return `/api/proposals/${encodeURIComponent(id)}/export?format=pdf`;
}

/** `<proposal-id>.json` — the JSON download filename. */
export function proposalJsonFilename(p: Pick<TradeProposal, "id">): string {
  return `${p.id}.json`;
}

/** The raw proposal object, pretty-printed — the canonical stored shape, so it
 *  round-trips against `TradeProposalSchema`. */
export function proposalJsonString(p: TradeProposal): string {
  return JSON.stringify(p, null, 2);
}

export interface CopyMarkdownDeps {
  /** Injectable for tests; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Injectable for tests; defaults to `navigator.clipboard`. */
  clipboard?: Pick<Clipboard, "writeText">;
}

/**
 * Fetch the canonical Export-Markdown for a proposal and write it to the
 * clipboard, returning the copied text. Throws when the export request fails or
 * the clipboard write is rejected (the caller surfaces a transient error state).
 */
export async function copyProposalMarkdown(
  id: string,
  deps: CopyMarkdownDeps = {},
): Promise<string> {
  const doFetch = deps.fetch ?? fetch;
  const clipboard =
    deps.clipboard ??
    (typeof navigator !== "undefined" ? navigator.clipboard : undefined);
  if (!clipboard) throw new Error("Clipboard unavailable");

  const res = await doFetch(markdownExportUrl(id));
  if (!res.ok) throw new Error(`Markdown export failed (${res.status})`);
  const markdown = await res.text();
  await clipboard.writeText(markdown);
  return markdown;
}
