import { describe, expect, it } from "vitest";
import {
  readCoachingLog,
  readJournal,
  readLatestSnapshot,
  readProposals,
  readSnapshots,
} from "./data";

// These exercise the readers against the local seed fixtures in `data/`
// (gitignored sample data). A passing run proves every fixture parses and
// satisfies its zod contract.
describe("data readers", () => {
  it("reads and validates all snapshots, ordered oldest → newest", async () => {
    const snapshots = await readSnapshots();
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < snapshots.length; i++) {
      expect(snapshots[i].asOf >= snapshots[i - 1].asOf).toBe(true);
    }
  });

  it("returns the latest paper snapshot with positions", async () => {
    const latest = await readLatestSnapshot("paper");
    expect(latest).not.toBeNull();
    expect(latest?.account).toBe("paper");
    expect(latest?.positions.length).toBeGreaterThan(0);
    // currency default applied by the schema
    expect(latest?.currency).toBe("USD");
  });

  it("reads the journal reverse-chronologically with both entry kinds", async () => {
    const entries = await readJournal();
    expect(entries.length).toBeGreaterThanOrEqual(5);

    const kinds = new Set(entries.map((e) => e.kind));
    expect(kinds.has("trade")).toBe(true);
    expect(kinds.has("rejection")).toBe(true);

    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].timestamp >= entries[i].timestamp).toBe(true);
    }
  });

  it("filters proposals by pending status", async () => {
    const all = await readProposals();
    const pending = await readProposals({ pendingOnly: true });

    expect(all.length).toBeGreaterThan(pending.length);
    expect(pending.every((p) => p.status === "pending")).toBe(true);
    expect(pending.length).toBeGreaterThan(0);
  });

  it("reads coaching entries newest first", async () => {
    const entries = await readCoachingLog();
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i - 1].date >= entries[i].date).toBe(true);
    }
  });
});
