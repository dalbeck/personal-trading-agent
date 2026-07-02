import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWrite } from "./atomic-write";
import { SLEEVE_CONFIG_LIST } from "@strategy/sleeves.config";
import { SLEEVE_LABEL } from "@/lib/sleeves";
import type { Horizon, Sleeve } from "@/lib/types";

/**
 * Governance docs surfaced on `/strategy` (sleeve-framework M1). The allowlist is
 * **data-driven** from the sleeve registry — every sleeve's `charterPath` plus
 * the shared docs (playbook + the safety-envelope README) — rather than a
 * hardcoded pair. The path-traversal guard stays: `resolve()` only joins ids that
 * are in this explicit allowlist, and double-checks the resolved path stays
 * inside the strategy dir, so no arbitrary or nested file can be read/written.
 *
 * Doc ids are the `charterPath`/path **without** the `.md` suffix — flat
 * (`charter`, `playbook`) or registered-nested (`charters/core-long`,
 * `charters/README`). A registered file that does not exist yet reads as `""`
 * (the new sleeve charters land in M3 / M4), so the page renders it empty until
 * its milestone fills it in — no further page change needed.
 */

const MAX_BYTES = 100_000;

/** The playbook — the checklist + banked lessons (editable; agent appends to it). */
const PLAYBOOK_DOC = "playbook";
/** The shared safety-envelope README — documentation of the enforced cross-sleeve
 *  caps in `charter.config.ts` (editing its prose never changes enforcement). */
const SAFETY_ENVELOPE_DOC = "charters/README";

export type StrategyDocGroup = "Charters" | "Playbook";

/** Sleeve routing for a charter row — which sleeve(s) the file governs, their
 *  shared horizon, and whether any is enabled. Null for non-charter docs. */
export interface StrategyDocSleeveMeta {
  ids: Sleeve[];
  horizon: Horizon;
  enabled: boolean;
}

/** A governance doc the page can list/read/edit. */
export interface StrategyDocMeta {
  /** Allowlisted id (path without `.md`). */
  doc: string;
  /** Human title for the tab/header. */
  title: string;
  /** Display group. */
  group: StrategyDocGroup;
  /** Sleeve routing (charters only); null for playbook + the safety README. */
  sleeve: StrategyDocSleeveMeta | null;
}

/** The charter rows, derived from the sleeve registry: one row per **unique**
 *  charter file (the two swing sleeves share `charter.md`), in horizon order. */
function charterDocs(): StrategyDocMeta[] {
  const byPath = new Map<string, Sleeve[]>();
  for (const c of SLEEVE_CONFIG_LIST) {
    const list = byPath.get(c.charterPath) ?? [];
    list.push(c.id);
    byPath.set(c.charterPath, list);
  }
  return [...byPath.entries()].map(([charterPath, ids]) => {
    const doc = charterPath.replace(/\.md$/, "");
    const configs = ids.map(
      (id) => SLEEVE_CONFIG_LIST.find((c) => c.id === id)!,
    );
    const horizon = configs[0].horizon;
    const enabled = configs.some((c) => c.enabled);
    // The shared swing charter governs both swing sleeves → a single "Swing
    // charter" row; a sleeve-specific charter is labelled by its sleeve + horizon.
    const title =
      ids.length > 1
        ? "Swing charter"
        : `${SLEEVE_LABEL[ids[0]]} (${horizon})`;
    return { doc, title, group: "Charters" as const, sleeve: { ids, horizon, enabled } };
  });
}

/** Every doc the page lists, in display order: Charters (swing, then each declared
 *  sleeve, then the shared Safety envelope), then the Playbook. */
export function listStrategyDocs(): StrategyDocMeta[] {
  return [
    ...charterDocs(),
    {
      doc: SAFETY_ENVELOPE_DOC,
      title: "Safety envelope",
      group: "Charters",
      sleeve: null,
    },
    { doc: PLAYBOOK_DOC, title: "Playbook", group: "Playbook", sleeve: null },
  ];
}

/** The allowlist set — the only ids that may be read or written. */
const STRATEGY_DOC_IDS: ReadonlySet<string> = new Set(
  listStrategyDocs().map((d) => d.doc),
);

/** Every allowlisted doc id (stable order). */
export const STRATEGY_DOCS: readonly string[] = listStrategyDocs().map(
  (d) => d.doc,
);

export interface StrategyDirOpts {
  /** Override the strategy dir (tests). Defaults to env / repo `strategy/`. */
  strategyDir?: string;
}

function strategyDir(opts?: StrategyDirOpts): string {
  return (
    opts?.strategyDir ??
    process.env.TRADING_STRATEGY_DIR ??
    path.join(process.cwd(), "strategy")
  );
}

export function isStrategyDoc(value: string): boolean {
  return STRATEGY_DOC_IDS.has(value);
}

function resolve(doc: string, opts?: StrategyDirOpts): string {
  // Allowlist membership is the primary traversal guard — only registered ids
  // (no `..`, no arbitrary nesting) ever reach here.
  if (!isStrategyDoc(doc)) {
    throw new Error(`Unknown strategy doc: ${doc}`);
  }
  const root = strategyDir(opts);
  const full = path.join(root, `${doc}.md`);
  // Defense in depth: the resolved path must stay inside the strategy dir.
  const rel = path.relative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Strategy doc escapes the strategy dir: ${doc}`);
  }
  return full;
}

export async function readStrategyDoc(
  doc: string,
  opts?: StrategyDirOpts,
): Promise<string> {
  try {
    return await readFile(resolve(doc, opts), "utf8");
  } catch (err) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      // A registered-but-not-yet-created charter (e.g. the M3 core-long file)
      // reads empty until its milestone lands.
      return "";
    }
    throw err;
  }
}

export async function writeStrategyDoc(
  doc: string,
  content: string,
  opts?: StrategyDirOpts,
): Promise<void> {
  if (content.length > MAX_BYTES) {
    throw new Error("Document exceeds the size limit.");
  }
  await atomicWrite(resolve(doc, opts), content);
}
