import "server-only";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Single-instance lockfile so a manual run can't trade over a scheduled one
 * (Phase 2 M5). Acquisition is atomic — `writeFile` with the `wx` flag
 * (`O_CREAT | O_EXCL`) fails if the file already exists. A held lock older than
 * `staleMs` is considered abandoned (crashed run) and stolen. Release only
 * removes a lock whose token matches, so we never delete another holder's lock.
 */

const DEFAULT_STALE_MS = 30 * 60 * 1000; // 30 min — longer than any routine

export interface LockHandle {
  name: string;
  path: string;
  token: string;
}

export interface LockOpts {
  /** Lock directory. Defaults to `<data>/locks`. */
  dir?: string;
  /** A held lock older than this is stolen. */
  staleMs?: number;
  /** Injectable clock (ms) for tests. */
  now?: () => number;
}

interface LockBody {
  pid: number;
  token: string;
  acquiredAt: number;
}

function lockDir(opts?: LockOpts): string {
  if (opts?.dir) return opts.dir;
  const data =
    process.env.TRADING_DATA_DIR ?? path.join(process.cwd(), "data");
  return path.join(data, "locks");
}

function makeToken(now: number): string {
  return `${process.pid}-${now}-${Math.random().toString(36).slice(2)}`;
}

async function tryCreate(
  file: string,
  body: LockBody,
): Promise<boolean> {
  try {
    await writeFile(file, JSON.stringify(body), { flag: "wx" });
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "EEXIST") return false;
    throw err;
  }
}

export async function acquireLock(
  name: string,
  opts?: LockOpts,
): Promise<LockHandle | null> {
  const now = opts?.now?.() ?? Date.now();
  const staleMs = opts?.staleMs ?? DEFAULT_STALE_MS;
  const dir = lockDir(opts);
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.lock`);
  const token = makeToken(now);
  const body: LockBody = { pid: process.pid, token, acquiredAt: now };

  if (await tryCreate(file, body)) {
    return { name, path: file, token };
  }

  // Held — steal it only if it is stale.
  let existing: LockBody | null = null;
  try {
    existing = JSON.parse(await readFile(file, "utf8")) as LockBody;
  } catch {
    existing = null; // unreadable/garbage — treat as stale
  }
  const age = existing ? now - existing.acquiredAt : Infinity;
  if (age <= staleMs) return null;

  await unlink(file).catch(() => {});
  if (await tryCreate(file, body)) {
    return { name, path: file, token };
  }
  return null; // lost a race to another stealer
}

export async function releaseLock(handle: LockHandle): Promise<void> {
  let body: LockBody | null = null;
  try {
    body = JSON.parse(await readFile(handle.path, "utf8")) as LockBody;
  } catch {
    return; // already gone
  }
  if (body.token === handle.token) {
    await unlink(handle.path).catch(() => {});
  }
}

/**
 * Run `task` while holding the named lock. Returns the task's result, or `null`
 * if the lock could not be acquired (another instance is running). The lock is
 * always released, even if the task throws.
 */
export async function withLock<T>(
  name: string,
  task: () => Promise<T>,
  opts?: LockOpts,
): Promise<T | null> {
  const handle = await acquireLock(name, opts);
  if (!handle) return null;
  try {
    return await task();
  } finally {
    await releaseLock(handle);
  }
}

/**
 * Like {@link withLock} but WAITS for a contended lock — retries acquisition up
 * to `retries` times (default 10), sleeping `retryDelayMs` (default 50) between
 * tries, before giving up. Serializes short read-modify-write ops (e.g. proposal
 * mutations) across processes instead of dropping them on the first contention.
 * Returns `null` only when the lock is still held after every retry. (H8)
 */
export async function withRetryingLock<T>(
  name: string,
  task: () => Promise<T>,
  opts?: LockOpts & { retries?: number; retryDelayMs?: number },
): Promise<T | null> {
  const retries = opts?.retries ?? 10;
  const delay = opts?.retryDelayMs ?? 50;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const handle = await acquireLock(name, opts);
    if (handle) {
      try {
        return await task();
      } finally {
        await releaseLock(handle);
      }
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return null;
}
