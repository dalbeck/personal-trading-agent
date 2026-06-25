import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  etDay,
  incrementOrdersToday,
  readOrdersToday,
} from "./order-counter";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-counter-"));
}

// A fixed instant in the New York morning — unambiguously one ET day.
const JUN24_AM = new Date("2026-06-24T13:41:00Z"); // 09:41 ET
const JUN24_PM = new Date("2026-06-24T19:00:00Z"); // 15:00 ET (same ET day)
const JUN25_AM = new Date("2026-06-25T13:41:00Z"); // next ET day

describe("etDay", () => {
  it("returns the ET calendar date, not the UTC date", () => {
    // 2026-06-25T01:30:00Z is still 2026-06-24 in New York (21:30 ET).
    expect(etDay(new Date("2026-06-25T01:30:00Z"))).toBe("2026-06-24");
    expect(etDay(JUN24_AM)).toBe("2026-06-24");
  });
});

describe("readOrdersToday / incrementOrdersToday", () => {
  it("starts at 0 when no counter file exists", async () => {
    const dataDir = await tmp();
    expect(await readOrdersToday({ dataDir, now: JUN24_AM })).toBe(0);
  });

  it("increments and persists, and the count survives across reads (runs)", async () => {
    const dataDir = await tmp();
    expect(await incrementOrdersToday({ dataDir, now: JUN24_AM })).toBe(1);
    expect(await incrementOrdersToday({ dataDir, now: JUN24_AM })).toBe(2);
    // A fresh read (a separate "run") still sees the persisted count.
    expect(await readOrdersToday({ dataDir, now: JUN24_PM })).toBe(2);
  });

  it("resets to 0 / 1 on a new ET day", async () => {
    const dataDir = await tmp();
    await incrementOrdersToday({ dataDir, now: JUN24_AM });
    await incrementOrdersToday({ dataDir, now: JUN24_AM });
    // New ET day → the prior day's count no longer applies.
    expect(await readOrdersToday({ dataDir, now: JUN25_AM })).toBe(0);
    expect(await incrementOrdersToday({ dataDir, now: JUN25_AM })).toBe(1);
  });

  it("treats a malformed counter file as 0 (best-effort, never throws)", async () => {
    const dataDir = await tmp();
    const file = path.join(dataDir, "control", "order-counter.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{ not json", "utf8");
    expect(await readOrdersToday({ dataDir, now: JUN24_AM })).toBe(0);
  });

  it("writes a readable {date,count} state file", async () => {
    const dataDir = await tmp();
    await incrementOrdersToday({ dataDir, now: JUN24_AM });
    const raw = await readFile(
      path.join(dataDir, "control", "order-counter.json"),
      "utf8",
    );
    expect(JSON.parse(raw)).toEqual({ date: "2026-06-24", count: 1 });
  });
});
