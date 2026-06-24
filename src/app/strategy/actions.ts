"use server";

import { revalidatePath } from "next/cache";
import {
  isStrategyDoc,
  writeStrategyDoc,
} from "@/lib/server/strategy";

export type SaveResult = { ok: true } | { ok: false; error: string };

/**
 * Server action: persist an edited governance doc back to `strategy/*.md`.
 * The doc name is allowlisted in the strategy lib (no arbitrary file writes).
 */
export async function saveStrategyDoc(
  doc: string,
  content: string,
): Promise<SaveResult> {
  if (!isStrategyDoc(doc)) {
    return { ok: false, error: "Unknown document." };
  }
  try {
    await writeStrategyDoc(doc, content);
    revalidatePath("/strategy");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
