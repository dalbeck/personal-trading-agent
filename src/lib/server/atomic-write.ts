import "server-only";

import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

let counter = 0;

/**
 * Write `contents` to `absPath` atomically (H8): create the parent dir, write to
 * a sibling `<name>.<n>.tmp` in the SAME directory, then `rename` it onto the
 * target — an atomic operation on a single filesystem. A crash therefore leaves
 * either the intact old file or the intact new one, never a truncated mix. On any
 * error the temp file is removed and the error rethrown.
 *
 * The temp file must share the target's directory so the rename stays on one
 * filesystem (a cross-device rename would fall back to a non-atomic copy).
 */
export async function atomicWrite(
  absPath: string,
  contents: string,
): Promise<void> {
  const dir = path.dirname(absPath);
  await mkdir(dir, { recursive: true });
  // A per-call unique sibling name — pid + a process-local counter avoid clashes
  // between concurrent writers without needing a clock (unavailable in some
  // runtimes) or randomness.
  const tmp = path.join(dir, `.${path.basename(absPath)}.${process.pid}.${counter++}.tmp`);
  try {
    await writeFile(tmp, contents, "utf8");
    await rename(tmp, absPath);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}
