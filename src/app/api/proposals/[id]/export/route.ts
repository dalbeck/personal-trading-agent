import path from "node:path";
import { createRequire } from "node:module";
import {
  buildProposalPdfDocDefinition,
  exportFilenameBase,
  proposalToMarkdown,
} from "@/lib/proposal-export";
import { readProposals } from "@/lib/server/data";

/**
 * Proposal export (proposal-export M2). `GET /api/proposals/[id]/export?format=md|pdf`
 * streams the full-context proposal as a downloadable Markdown or PDF file —
 * the user's own data, so a direct download is fine. **Read-only**: it reads one
 * proposal and serializes it; it places nothing and changes no state/gate.
 *
 * The Markdown + the pdfmake document definition are built by the **pure**
 * serializers in `src/lib/proposal-export.ts` (unit-tested); this route only
 * renders the PDF bytes (pdfmake printer + the bundled Roboto fonts) and sets the
 * download headers. LOCAL only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// pdfmake 0.3 is a CJS singleton with no types/`exports` map; resolve it at
// runtime (not bundled) so Turbopack doesn't try to trace the font assets.
const require = createRequire(import.meta.url);

interface PdfMake {
  setLocalAccessPolicy(cb: (p: string) => boolean): void;
  setUrlAccessPolicy(cb: (u: string) => boolean): void;
  addFonts(fonts: Record<string, Record<string, string>>): void;
  createPdf(docDefinition: unknown): { getBuffer(): Promise<Buffer> };
}

let pdfmake: PdfMake | null = null;

/** Configure the pdfmake singleton once: point it at the bundled Roboto TTFs and
 *  lock down file/URL access (no external fetches, only the font dir on disk). */
function getPdfMake(): PdfMake {
  if (pdfmake) return pdfmake;
  const pm = require("pdfmake") as PdfMake;
  // Resolve the bundled Roboto TTFs from the real filesystem, NOT via
  // `require.resolve` — under Turbopack that returns an instrumented `[project]/…`
  // path that doesn't exist on disk. cwd is the project root at runtime
  // (`next dev` / `next start`), where `node_modules/pdfmake` symlinks to the
  // pnpm store.
  const fontDir = path.join(
    process.cwd(),
    "node_modules",
    "pdfmake",
    "build",
    "fonts",
    "Roboto",
  );
  pm.setLocalAccessPolicy((p) => p.startsWith(fontDir)); // only the bundled fonts
  pm.setUrlAccessPolicy(() => false); // never fetch external resources
  pm.addFonts({
    Roboto: {
      normal: path.join(fontDir, "Roboto-Regular.ttf"),
      bold: path.join(fontDir, "Roboto-Medium.ttf"),
      italics: path.join(fontDir, "Roboto-Italic.ttf"),
      bolditalics: path.join(fontDir, "Roboto-MediumItalic.ttf"),
    },
  });
  pdfmake = pm;
  return pm;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const format =
    new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "md";

  const all = await readProposals();
  const proposal = all.find((p) => p.id === id);
  if (!proposal) {
    return new Response("Proposal not found", { status: 404 });
  }

  const generatedAt = new Date().toISOString();
  const base = exportFilenameBase(proposal);

  if (format === "md") {
    const md = proposalToMarkdown(proposal, { generatedAt });
    return new Response(md, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="${base}.md"`,
      },
    });
  }

  const docDefinition = buildProposalPdfDocDefinition(proposal, { generatedAt });
  const pdf = getPdfMake().createPdf(docDefinition);
  const buffer = await pdf.getBuffer();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${base}.pdf"`,
    },
  });
}
