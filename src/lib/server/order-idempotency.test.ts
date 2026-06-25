import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveClientOrderId,
  readPlacedOrder,
  recordPlacedOrder,
  runSingleFlight,
  type PlacedRecord,
} from "./order-idempotency";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-idem-"));
}

const ORDER = {
  symbol: "MSFT",
  action: "buy",
  qty: 3,
  limitPrice: 400,
  reviewDate: "2026-07-21",
  account: "paper" as const,
};

describe("deriveClientOrderId", () => {
  it("prefers an explicit (trimmed) idempotency key", () => {
    expect(
      deriveClientOrderId({ idempotencyKey: "  p-42  ", order: ORDER }),
    ).toBe("p-42");
  });

  it("derives a stable id from the order's stable fields (no timestamp)", () => {
    const a = deriveClientOrderId({ order: ORDER });
    const b = deriveClientOrderId({ idempotencyKey: null, order: { ...ORDER } });
    expect(a).toBe(b); // identical across calls — nothing time-varying
    expect(a).toContain("MSFT");
  });

  it("distinguishes different orders", () => {
    expect(deriveClientOrderId({ order: ORDER })).not.toBe(
      deriveClientOrderId({ order: { ...ORDER, qty: 4 } }),
    );
    expect(deriveClientOrderId({ order: ORDER })).not.toBe(
      deriveClientOrderId({ order: { ...ORDER, account: "live" } }),
    );
  });
});

describe("readPlacedOrder / recordPlacedOrder", () => {
  const rec: PlacedRecord = {
    clientOrderId: "p-1",
    destination: "mock",
    brokerOrderId: "mock-1",
    journalId: "j-1",
    dryRun: true,
    placedAt: "2026-06-24T10:00:00-04:00",
  };

  it("round-trips a placement record by client order id", async () => {
    const dataDir = await tmp();
    expect(await readPlacedOrder("p-1", { dataDir })).toBeNull();
    await recordPlacedOrder(rec, { dataDir });
    expect(await readPlacedOrder("p-1", { dataDir })).toEqual(rec);
  });

  it("treats a malformed record file as 'not placed' (never throws)", async () => {
    const dataDir = await tmp();
    // The filename is hashed, so just ensure an unreadable dir/file is a miss.
    const dir = path.join(dataDir, "control", "placed-orders");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "garbage.json"), "{ not json", "utf8");
    expect(await readPlacedOrder("anything", { dataDir })).toBeNull();
  });
});

describe("runSingleFlight", () => {
  it("shares one in-flight promise for the same key (runs once concurrently)", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const fn = async () => {
      calls += 1;
      await gate;
      return calls;
    };
    const p1 = runSingleFlight("k", fn);
    const p2 = runSingleFlight("k", fn); // joins p1
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(calls).toBe(1);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("re-runs sequentially after the prior settles, and isolates distinct keys", async () => {
    let calls = 0;
    const fn = async () => ++calls;
    expect(await runSingleFlight("k", fn)).toBe(1);
    expect(await runSingleFlight("k", fn)).toBe(2); // cleared after settle
    expect(await runSingleFlight("other", fn)).toBe(3); // independent key
  });
});
