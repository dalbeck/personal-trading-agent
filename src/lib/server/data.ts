import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { z } from "zod";
import { parseFrontmatter } from "./frontmatter";
import {
  CoachingEntrySchema,
  JournalEntrySchema,
  NewsFileSchema,
  PortfolioSnapshotSchema,
  RunLogSchema,
  TradeProposalSchema,
  WatchlistSchema,
} from "@/lib/schemas";
import type {
  Account,
  CoachingEntry,
  JournalEntry,
  MaterialNewsItem,
  PortfolioSnapshot,
  RunLog,
  TradeProposal,
  WatchlistEntry,
} from "@/lib/types";

/**
 * Server-only readers for the local `data/` directory. All file access lives
 * here — never in components or client code (`server-only` enforces this at
 * build time). Every read is validated against the zod contracts; an invalid
 * file fails loudly with its path so a malformed engine write can't silently
 * corrupt a view.
 */

// Runtime data lives in the gitignored `data/` dir; `TRADING_DATA_DIR` lets
// tests (and future tooling) point the readers at a fixed fixture set.
const DATA_DIR =
  process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");

class DataValidationError extends Error {
  constructor(file: string, issues: z.core.$ZodIssue[]) {
    const detail = issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    super(`Invalid data file ${file}:\n${detail}`);
    this.name = "DataValidationError";
  }
}

function isENOENT(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}

/** Parse + validate a single JSON file. Throws on bad JSON or schema mismatch. */
async function readJsonFile<S extends z.ZodType>(
  absPath: string,
  schema: S,
): Promise<z.infer<S>> {
  const raw = await readFile(absPath, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Malformed JSON in ${path.relative(process.cwd(), absPath)}: ${
        (err as Error).message
      }`,
    );
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new DataValidationError(
      path.relative(process.cwd(), absPath),
      result.error.issues,
    );
  }
  return result.data;
}

/** Read + validate every `*.json` file in a `data/` subdirectory (sorted). */
async function readJsonDir<S extends z.ZodType>(
  subdir: string,
  schema: S,
): Promise<z.infer<S>[]> {
  return readDir(subdir, ".json", readJsonFile, schema);
}

/** Parse + validate a single Markdown + YAML-frontmatter file. The frontmatter
 *  fields plus a `body` (the markdown prose) are validated against `schema`. */
async function readMarkdownFile<S extends z.ZodType>(
  absPath: string,
  schema: S,
): Promise<z.infer<S>> {
  const raw = await readFile(absPath, "utf8");
  let frontmatter: { data: Record<string, unknown>; body: string };
  try {
    frontmatter = parseFrontmatter(raw);
  } catch (err) {
    throw new Error(
      `Malformed frontmatter in ${path.relative(process.cwd(), absPath)}: ${
        (err as Error).message
      }`,
    );
  }
  const candidate = { ...frontmatter.data, body: frontmatter.body };
  const result = schema.safeParse(candidate);
  if (!result.success) {
    throw new DataValidationError(
      path.relative(process.cwd(), absPath),
      result.error.issues,
    );
  }
  return result.data;
}

/** Read + validate every `*.md` file in a `data/` subdirectory (sorted). */
async function readMarkdownDir<S extends z.ZodType>(
  subdir: string,
  schema: S,
): Promise<z.infer<S>[]> {
  return readDir(subdir, ".md", readMarkdownFile, schema);
}

/** Shared dir walk: read every file with `ext` through `readOne` (sorted). */
async function readDir<S extends z.ZodType>(
  subdir: string,
  ext: ".json" | ".md",
  readOne: (absPath: string, schema: S) => Promise<z.infer<S>>,
  schema: S,
): Promise<z.infer<S>[]> {
  const dir = path.join(DATA_DIR, subdir);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if (isENOENT(err)) return []; // no fixtures yet — empty, not an error
    throw err;
  }
  const files = names.filter((n) => n.endsWith(ext)).sort();
  // Resilient read (H8): a single malformed/invalid file is SKIPPED with a
  // warning, not thrown — one corrupt artifact can't brick the whole list read
  // (and take down the dashboard). `validateDataDir` keeps its own strict path,
  // so corruption is still caught by validation.
  const settled = await Promise.allSettled(
    files.map((f) => readOne(path.join(dir, f), schema)),
  );
  const out: z.infer<S>[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") out.push(r.value);
    else
      console.warn(
        `[data] skipping unreadable ${subdir}/${files[i]}: ${
          (r.reason as Error)?.message ?? r.reason
        }`,
      );
  }
  return out;
}

/* ----------------------------- Snapshots ------------------------------- */

/** All snapshots, oldest → newest by `asOf`. */
export async function readSnapshots(): Promise<PortfolioSnapshot[]> {
  const snapshots = await readJsonDir("snapshots", PortfolioSnapshotSchema);
  return snapshots.sort((a, b) => a.asOf.localeCompare(b.asOf));
}

/** Most recent snapshot, optionally for a specific account. `null` if none. */
export async function readLatestSnapshot(
  account?: Account,
): Promise<PortfolioSnapshot | null> {
  const snapshots = await readSnapshots();
  const scoped = account
    ? snapshots.filter((s) => s.account === account)
    : snapshots;
  return scoped.at(-1) ?? null;
}

/* --------------------------- Decision journal -------------------------- */

/** Journal entries (trades + rejections), reverse-chronological. Narrative
 *  artifacts: Markdown + YAML frontmatter (see `.agents/data-format.md`). */
export async function readJournal(): Promise<JournalEntry[]> {
  const entries = await readMarkdownDir("decision-journal", JournalEntrySchema);
  return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/* ------------------------------ Proposals ------------------------------ */

/** Trade proposals, newest first. Pass `{ pendingOnly }` to filter. */
export async function readProposals(
  opts: { pendingOnly?: boolean } = {},
): Promise<TradeProposal[]> {
  const proposals = await readJsonDir("proposals", TradeProposalSchema);
  const filtered = opts.pendingOnly
    ? proposals.filter((p) => p.status === "pending")
    : proposals;
  return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ----------------------------- Coaching log ---------------------------- */

/** Coaching entries, newest first. Narrative artifacts: Markdown + YAML
 *  frontmatter (see `.agents/data-format.md`). */
export async function readCoachingLog(): Promise<CoachingEntry[]> {
  const entries = await readMarkdownDir("coaching-log", CoachingEntrySchema);
  return entries.sort((a, b) => b.date.localeCompare(a.date));
}

/* ------------------------------- Run logs ------------------------------ */

/** Routine run logs, newest first. */
export async function readRunLogs(): Promise<RunLog[]> {
  const logs = await readJsonDir("logs", RunLogSchema);
  return logs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/* -------------------------------- News --------------------------------- */

/** All material news items (across the per-day files), newest first. */
export async function readMaterialNews(): Promise<MaterialNewsItem[]> {
  const files = await readJsonDir("news", NewsFileSchema); // each file is an array
  return files.flat().sort((a, b) => b.seenAt.localeCompare(a.seenAt));
}

/* ------------------------------ Watchlist ------------------------------ */

/** The watchlist entries (the editable half of the tracked universe), each with
 *  its provenance (`manual` | `discovery`). A single small JSON state file under
 *  `data/control/`. Missing/unreadable ⇒ an empty watchlist (the shipped
 *  default), never an error. Tolerates the legacy `{ symbols: [...] }` shape by
 *  treating those as manual entries. */
export async function readWatchlistEntries(
  opts?: { dataDir?: string },
): Promise<WatchlistEntry[]> {
  const root = opts?.dataDir ?? DATA_DIR;
  const file = path.join(root, "control", "watchlist.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  // Current shape: { entries: [...] }.
  const parsed = WatchlistSchema.safeParse(json);
  if (parsed.success) return parsed.data.entries;
  // Legacy shape: { symbols: ["NVDA", ...] } → manual entries. Validate the
  // migrated shape through the real schema (drops invalid tickers / files).
  const legacySymbols =
    json && typeof json === "object" && Array.isArray((json as { symbols?: unknown }).symbols)
      ? (json as { symbols: unknown[] }).symbols
      : [];
  const migrated = WatchlistSchema.safeParse({
    entries: legacySymbols.map((s) => ({ symbol: s })),
  });
  return migrated.success ? migrated.data.entries : [];
}

/** The watchlist symbols (provenance dropped) — the shape the tracked-universe
 *  builder consumes. */
export async function readWatchlist(
  opts?: { dataDir?: string },
): Promise<string[]> {
  return (await readWatchlistEntries(opts)).map((e) => e.symbol);
}

/** The most recent run log per routine id (for the Routines status view). */
export async function readLatestRunByRoutine(): Promise<
  Record<string, RunLog>
> {
  const logs = await readRunLogs(); // newest first
  const latest: Record<string, RunLog> = {};
  for (const log of logs) {
    if (!latest[log.routine]) latest[log.routine] = log;
  }
  return latest;
}
