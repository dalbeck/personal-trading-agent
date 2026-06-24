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

const STRATEGY_DIR =
  process.env.TRADING_STRATEGY_DIR ?? path.join(process.cwd(), "strategy");

const MAX_BYTES = 100_000;

export function isStrategyDoc(value: string): value is StrategyDoc {
  return (STRATEGY_DOCS as readonly string[]).includes(value);
}

function resolve(doc: StrategyDoc): string {
  return path.join(STRATEGY_DIR, `${doc}.md`);
}

export async function readStrategyDoc(doc: StrategyDoc): Promise<string> {
  try {
    return await readFile(resolve(doc), "utf8");
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
): Promise<void> {
  if (content.length > MAX_BYTES) {
    throw new Error("Document exceeds the size limit.");
  }
  await writeFile(resolve(doc), content, "utf8");
}
