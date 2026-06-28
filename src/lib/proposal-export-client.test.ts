import { describe, expect, it, vi } from "vitest";
import {
  copyProposalMarkdown,
  markdownExportUrl,
  pdfExportUrl,
  proposalJsonFilename,
  proposalJsonString,
} from "./proposal-export-client";
import { TradeProposalSchema } from "@/lib/schemas";
import type { TradeProposal } from "@/lib/types";

/** A canonical proposal — parsed through the schema so it carries every default,
 *  exactly like a persisted record. */
const PROPOSAL: TradeProposal = TradeProposalSchema.parse({
  id: "manual-NOW-20260628165552752",
  createdAt: "2026-06-28T16:55:52-04:00",
  symbol: "NOW",
  action: "buy",
  side: "long",
  strategy: "value",
  qty: 3,
  limitPrice: 905.5,
  stopPrice: 860,
  takeProfit: 1010,
  riskPct: 0.012,
  thesis: "Durable FCF with a federal catalyst.",
  reasoning: "Pullback into support held with a higher low.",
});

describe("proposalJsonString — round-trips against the schema", () => {
  it("serializes the raw proposal object so it re-validates and equals the source", () => {
    const json = proposalJsonString(PROPOSAL);
    const reparsed = TradeProposalSchema.parse(JSON.parse(json));
    expect(reparsed).toEqual(PROPOSAL);
  });

  it("is pretty-printed (multi-line) for a readable download", () => {
    expect(proposalJsonString(PROPOSAL)).toContain("\n");
  });
});

describe("proposalJsonFilename / export URLs", () => {
  it("names the JSON download <id>.json", () => {
    expect(proposalJsonFilename(PROPOSAL)).toBe(
      "manual-NOW-20260628165552752.json",
    );
  });

  it("builds the same export routes the downloads use", () => {
    expect(markdownExportUrl("p-1")).toBe(
      "/api/proposals/p-1/export?format=md",
    );
    expect(pdfExportUrl("p-1")).toBe("/api/proposals/p-1/export?format=pdf");
  });
});

describe("copyProposalMarkdown — clipboard write (mocked)", () => {
  it("copies the SAME markdown the Markdown download returns", async () => {
    const markdown = "# BUY NOW\n\nSnapshot…";
    const fetchMock = vi.fn(async () => new Response(markdown, { status: 200 }));
    const writeText = vi.fn(async () => undefined);

    const copied = await copyProposalMarkdown(PROPOSAL.id, {
      fetch: fetchMock as unknown as typeof fetch,
      clipboard: { writeText },
    });

    // It hit the SAME route the Export Markdown download uses (no fork).
    expect(fetchMock).toHaveBeenCalledWith(markdownExportUrl(PROPOSAL.id));
    // And wrote that exact body to the clipboard.
    expect(writeText).toHaveBeenCalledWith(markdown);
    expect(copied).toBe(markdown);
  });

  it("throws and does NOT write the clipboard when the export request fails", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    const writeText = vi.fn(async () => undefined);

    await expect(
      copyProposalMarkdown(PROPOSAL.id, {
        fetch: fetchMock as unknown as typeof fetch,
        clipboard: { writeText },
      }),
    ).rejects.toThrow(/failed/i);
    expect(writeText).not.toHaveBeenCalled();
  });
});
