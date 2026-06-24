import "server-only";

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Only these docs may be read/written — guards against path traversal. */
export const STRATEGY_DOCS = ["charter", "playbook"] as const;
export type StrategyDoc = (typeof STRATEGY_DOCS)[number];

export const STRATEGY_DOC_TITLES: Record<StrategyDoc, string> = {
  charter: "Charter",
  playbook: "Playbook",
};

const MAX_BYTES = 100_000;

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

export function isStrategyDoc(value: string): value is StrategyDoc {
  return (STRATEGY_DOCS as readonly string[]).includes(value);
}

function resolve(doc: StrategyDoc, opts?: StrategyDirOpts): string {
  return path.join(strategyDir(opts), `${doc}.md`);
}

export async function readStrategyDoc(
  doc: StrategyDoc,
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
      return "";
    }
    throw err;
  }
}

export async function writeStrategyDoc(
  doc: StrategyDoc,
  content: string,
  opts?: StrategyDirOpts,
): Promise<void> {
  if (content.length > MAX_BYTES) {
    throw new Error("Document exceeds the size limit.");
  }
  await writeFile(resolve(doc, opts), content, "utf8");
}
