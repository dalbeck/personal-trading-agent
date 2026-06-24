import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import {
  CoachingEntrySchema,
  JournalEntrySchema,
  NewsFileSchema,
  PortfolioSnapshotSchema,
  RunLogSchema,
  TradeProposalSchema,
} from "../schemas";
import { parseFrontmatter } from "./frontmatter";

/**
 * Standalone validator for the `data/` convention (see `.agents/data-format.md`).
 * Every artifact must live in its category's directory, use that category's
 * format, and satisfy its zod contract. Returns a flat list of problems —
 * empty means everything conforms. Used by the test suite and `pnpm validate:data`.
 *
 * Deliberately self-contained (no `server-only`, no `@/` alias) so it can be
 * imported by both vitest and the readers without pulling the RSC graph in.
 */

type Format = "md" | "json";

interface Category {
  subdir: string;
  format: Format;
  schema: z.ZodType;
}

const CATEGORIES: Category[] = [
  // Narrative → Markdown + YAML frontmatter.
  { subdir: "decision-journal", format: "md", schema: JournalEntrySchema },
  { subdir: "coaching-log", format: "md", schema: CoachingEntrySchema },
  // Structured → JSON.
  { subdir: "snapshots", format: "json", schema: PortfolioSnapshotSchema },
  { subdir: "proposals", format: "json", schema: TradeProposalSchema },
  { subdir: "logs", format: "json", schema: RunLogSchema },
  // Each news file is an array of material items.
  { subdir: "news", format: "json", schema: NewsFileSchema },
];

export interface ValidationProblem {
  file: string; // path relative to the data root
  problem: string;
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}

function toCandidate(format: Format, raw: string): unknown {
  if (format === "json") return JSON.parse(raw);
  const { data, body } = parseFrontmatter(raw);
  return { ...data, body };
}

export async function validateDataDir(
  root: string,
): Promise<ValidationProblem[]> {
  const problems: ValidationProblem[] = [];

  for (const { subdir, format, schema } of CATEGORIES) {
    const dir = path.join(root, subdir);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (err) {
      if (isENOENT(err)) continue; // absent category is fine
      throw err;
    }

    const ext = `.${format}`;
    const wrongExt = format === "md" ? ".json" : ".md";

    for (const name of names.sort()) {
      if (name.startsWith(".")) continue; // .DS_Store etc.
      const rel = path.join(subdir, name);

      if (name.endsWith(wrongExt)) {
        problems.push({
          file: rel,
          problem: `${subdir}/ is a ${format} category; ${wrongExt} files are not allowed`,
        });
        continue;
      }
      if (!name.endsWith(ext)) continue; // ignore unrelated files (READMEs, etc.)

      const raw = await readFile(path.join(dir, name), "utf8");
      let candidate: unknown;
      try {
        candidate = toCandidate(format, raw);
      } catch (err) {
        problems.push({ file: rel, problem: (err as Error).message });
        continue;
      }

      const result = schema.safeParse(candidate);
      if (!result.success) {
        for (const issue of result.error.issues) {
          problems.push({
            file: rel,
            problem: `${issue.path.join(".") || "(root)"}: ${issue.message}`,
          });
        }
      }
    }
  }

  return problems;
}
