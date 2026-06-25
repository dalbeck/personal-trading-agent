import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncLiveTrades } from "./live-trades";

const ORDERS = {
  orders: [
    {
      id: "rh-1",
      symbol: "NVDA",
      side: "buy",
      quantity: 2,
      average_price: 196.97,
      state: "filled",
      filled_at: "2026-06-24T14:31:00-04:00",
      created_at: "2026-06-24T14:30:00-04:00",
    },
    {
      id: "rh-2",
      symbol: "AAPL",
      side: "sell",
      quantity: 1,
      average_price: 210.5,
      state: "cancelled", // not filled — must be skipped
      filled_at: null,
      created_at: "2026-06-24T15:00:00-04:00",
    },
  ],
};

async function readJournalFiles(dir: string): Promise<
  { name: string; data: Record<string, unknown>; body: string }[]
> {
  const jdir = path.join(dir, "decision-journal");
  const names = (await readdir(jdir)).filter((n) => n.endsWith(".md")).sort();
  const out = [];
  for (const name of names) {
    const raw = await readFile(path.join(jdir, name), "utf8");
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    const fm: Record<string, unknown> = {};
    for (const line of (m?.[1] ?? "").split("\n")) {
      const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line);
      if (kv) fm[kv[1]] = kv[2].replace(/^"|"$/g, "");
    }
    out.push({ name, data: fm, body: m?.[2] ?? "" });
  }
  return out;
}

describe("syncLiveTrades", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "live-trades-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("no-ops when there is no connection and no injected fetcher", async () => {
    const res = await syncLiveTrades({ dataDir: dir });
    expect(res).toEqual({ connected: false, fetched: 0, ingested: 0 });
  });

  it("journals only filled trades as account:live, manual:true", async () => {
    const fetcher = vi.fn(async () => ORDERS);
    const res = await syncLiveTrades({
      fetcher,
      dataDir: dir,
      at: "2026-06-25T09:00:00-04:00",
    });
    expect(res).toEqual({ connected: true, fetched: 1, ingested: 1 });

    const files = await readJournalFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0].data.kind).toBe("trade");
    expect(files[0].data.account).toBe("live");
    expect(files[0].data.manual).toBe("true");
    expect(files[0].data.symbol).toBe("NVDA");
  });

  it("is idempotent — a second sync ingests nothing new", async () => {
    const fetcher = vi.fn(async () => ORDERS);
    await syncLiveTrades({ fetcher, dataDir: dir, at: "2026-06-25T09:00:00-04:00" });
    const second = await syncLiveTrades({
      fetcher,
      dataDir: dir,
      at: "2026-06-25T10:00:00-04:00",
    });
    expect(second.ingested).toBe(0);
    expect(await readJournalFiles(dir)).toHaveLength(1);
  });
});
