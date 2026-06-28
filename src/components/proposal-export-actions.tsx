"use client";

import { useState } from "react";
import {
  BracesIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
} from "@/components/icons";
import {
  copyProposalMarkdown,
  markdownExportUrl,
  pdfExportUrl,
  proposalJsonFilename,
  proposalJsonString,
} from "@/lib/proposal-export-client";
import type { TradeProposal } from "@/lib/types";

/**
 * The Export card actions (proposal-export-actions M2). Four actions, grouped:
 * - **Export PDF** / **Export Markdown** — the existing downloads, **unchanged**
 *   (same routes, same bytes); only an icon was added for a consistent card.
 * - **Copy Markdown** — copies the *same* markdown the download produces (via the
 *   `?format=md` route) to the clipboard, with a transient "Copied" state.
 * - **Export JSON** — downloads the raw proposal object as `<id>.json`.
 *
 * Client component: clipboard + Blob download need the browser. The markdown is
 * never re-generated here — it is fetched from the existing route, so Copy and
 * the Markdown download are byte-for-byte identical.
 */
type CopyState = "idle" | "copied" | "error";

export function ProposalExportActions({
  proposal,
}: {
  proposal: TradeProposal;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  async function handleCopyMarkdown() {
    try {
      await copyProposalMarkdown(proposal.id);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
    // Revert the transient confirmation after a moment.
    window.setTimeout(() => setCopyState("idle"), 2000);
  }

  function handleExportJson() {
    const blob = new Blob([proposalJsonString(proposal)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = proposalJsonFilename(proposal);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const copyLabel =
    copyState === "copied"
      ? "Copied"
      : copyState === "error"
        ? "Copy failed"
        : "Copy Markdown";

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <a href={pdfExportUrl(proposal.id)} download className={ACTION_CLASS}>
        <DownloadIcon className="size-4" />
        Export PDF
      </a>
      <a href={markdownExportUrl(proposal.id)} download className={ACTION_CLASS}>
        <DownloadIcon className="size-4" />
        Export Markdown
      </a>
      <button
        type="button"
        onClick={handleCopyMarkdown}
        aria-live="polite"
        className={ACTION_CLASS}
      >
        {copyState === "copied" ? (
          <CheckIcon className="size-4 text-success" />
        ) : (
          <CopyIcon className="size-4" />
        )}
        {copyLabel}
      </button>
      <button type="button" onClick={handleExportJson} className={ACTION_CLASS}>
        <BracesIcon className="size-4" />
        Export JSON
      </button>
    </div>
  );
}

const ACTION_CLASS =
  "inline-flex items-center gap-1.5 rounded-input border border-line bg-surface px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-overlay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
