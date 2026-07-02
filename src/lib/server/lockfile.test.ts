import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  acquireLock,
  releaseLock,
  withLock,
  withRetryingLock,
} from "./lockfile";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-lock-"));
}

describe("withRetryingLock (H8)", () => {
  it("serializes a contended task — the second waits for release, not dropped", async () => {
    const dir = await tmp();
    const order: string[] = [];
    // Task A holds the lock for a beat, then releases.
    const a = withRetryingLock(
      "proposals",
      async () => {
        order.push("a-start");
        await new Promise((r) => setTimeout(r, 60));
        order.push("a-end");
        return "a";
      },
      { dir },
    );
    // Give A time to grab the lock first.
    await new Promise((r) => setTimeout(r, 10));
    const b = withRetryingLock(
      "proposals",
      async () => {
        order.push("b-run");
        return "b";
      },
      { dir, retries: 20, retryDelayMs: 10 },
    );
    expect(await a).toBe("a");
    expect(await b).toBe("b"); // ran, not dropped
    // B ran strictly after A finished (serialized).
    expect(order).toEqual(["a-start", "a-end", "b-run"]);
  });

  it("returns null only when retries are exhausted against a held lock", async () => {
    const dir = await tmp();
    const held = await acquireLock("proposals", { dir });
    expect(held).not.toBeNull();
    const res = await withRetryingLock("proposals", async () => "ran", {
      dir,
      retries: 0,
    });
    expect(res).toBeNull();
    await releaseLock(held!);
  });
});

describe("acquireLock / releaseLock", () => {
  it("acquires a free lock and writes the lock file", async () => {
    const dir = await tmp();
    const handle = await acquireLock("market-open", { dir });
    expect(handle).not.toBeNull();
    const raw = await readFile(handle!.path, "utf8");
    expect(JSON.parse(raw)).toMatchObject({ pid: process.pid });
  });

  it("refuses a second acquire while the lock is held and fresh", async () => {
    const dir = await tmp();
    const first = await acquireLock("market-open", { dir });
    const second = await acquireLock("market-open", { dir });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("allows re-acquire after release", async () => {
    const dir = await tmp();
    const first = await acquireLock("market-open", { dir });
    await releaseLock(first!);
    const second = await acquireLock("market-open", { dir });
    expect(second).not.toBeNull();
  });

  it("steals a stale lock past the timeout", async () => {
    const dir = await tmp();
    const t0 = 1_000_000;
    const held = await acquireLock("market-open", {
      dir,
      now: () => t0,
    });
    expect(held).not.toBeNull();
    // A fresh attempt within the window is refused…
    expect(
      await acquireLock("market-open", { dir, staleMs: 5000, now: () => t0 + 1 }),
    ).toBeNull();
    // …but past the stale timeout it is stolen.
    const stolen = await acquireLock("market-open", {
      dir,
      staleMs: 5000,
      now: () => t0 + 5001,
    });
    expect(stolen).not.toBeNull();
  });

  it("release only removes our own lock, not someone else's", async () => {
    const dir = await tmp();
    const handle = await acquireLock("market-open", { dir });
    // Someone else overwrote the lock file with a different token.
    await writeFile(
      handle!.path,
      JSON.stringify({ pid: 999, token: "other", acquiredAt: Date.now() }),
    );
    await releaseLock(handle!);
    // The other holder's lock is intact — a fresh acquire is refused.
    expect(await acquireLock("market-open", { dir })).toBeNull();
  });
});

describe("withLock", () => {
  it("runs the task under the lock and releases it after", async () => {
    const dir = await tmp();
    const ran = await withLock("eod", async () => "did work", { dir });
    expect(ran).toBe("did work");
    // Lock released → can acquire again.
    expect(await acquireLock("eod", { dir })).not.toBeNull();
  });

  it("returns null and skips the task when the lock is held", async () => {
    const dir = await tmp();
    await acquireLock("eod", { dir });
    let ran = false;
    const result = await withLock(
      "eod",
      async () => {
        ran = true;
        return "x";
      },
      { dir },
    );
    expect(result).toBeNull();
    expect(ran).toBe(false);
  });

  it("releases the lock even if the task throws", async () => {
    const dir = await tmp();
    await expect(
      withLock("eod", async () => {
        throw new Error("boom");
      }, { dir }),
    ).rejects.toThrow("boom");
    expect(await acquireLock("eod", { dir })).not.toBeNull();
  });
});
