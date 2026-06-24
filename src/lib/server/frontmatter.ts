import { JSON_SCHEMA, load } from "js-yaml";

/**
 * Minimal Markdown + YAML-frontmatter splitter for narrative `data/` artifacts
 * (decision journal, coaching log, chats). See `.agents/data-format.md`.
 *
 * Parsed with js-yaml's `JSON_SCHEMA` on purpose: the default YAML schema
 * coerces unquoted ISO dates/timestamps into `Date` objects, which would break
 * the string-typed zod contracts. JSON_SCHEMA resolves only null/bool/int/
 * float/string, so `2026-07-21` stays the string `"2026-07-21"`.
 */

export interface ParsedFrontmatter {
  /** The frontmatter mapping (untyped — validated by a zod schema upstream). */
  data: Record<string, unknown>;
  /** The markdown body, trimmed of surrounding blank lines. */
  body: string;
}

// Opening `---`, the YAML block (non-greedy up to the first closing `---`),
// then the rest of the document as the body. Tolerates a BOM and CRLF.
const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n([\s\S]*))?$/;

export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const text = raw.replace(/^﻿/, "");
  const match = FRONTMATTER.exec(text);
  if (!match) {
    throw new Error("missing YAML frontmatter delimited by `---`");
  }
  const parsed = load(match[1], { schema: JSON_SCHEMA });
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("frontmatter must be a YAML mapping (key: value pairs)");
  }
  return {
    data: parsed as Record<string, unknown>,
    body: (match[2] ?? "").trim(),
  };
}
