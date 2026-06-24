import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertLiveOrderAllowed,
  brokerGateOpen,
  clearDisconnect,
  disconnectLive,
  getLiveTradingStatus,
  harnessGateOpen,
  HARNESS_ORDER_PERMISSIONS,
  isDisconnected,
  isTradingHalted,
  LIVE_ORDER_TOOLS,
} from "./gate";
import * as gate from "./gate";

const BROKER_ENV = "ROBINHOOD_BROKER_TRADING_ENABLED";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-gate-"));
}

async function writeSettings(
  dir: string,
  perms: { allow?: string[]; deny?: string[] },
): Promise<string> {
  const file = path.join(dir, "settings.json");
  await writeFile(file, JSON.stringify({ permissions: perms }), "utf8");
  return file;
}

const OPEN_HARNESS = { allow: [...HARNESS_ORDER_PERMISSIONS] };

beforeEach(() => {
  delete process.env[BROKER_ENV];
});
afterEach(() => {
  delete process.env[BROKER_ENV];
});

describe("two-gate model", () => {
  it("is closed by default — no env, no settings", async () => {
    const dir = await tmp();
    const status = await getLiveTradingStatus({
      dataDir: dir,
      settingsPaths: [path.join(dir, "settings.json")],
    });
    expect(status.brokerGateOpen).toBe(false);
    expect(status.harnessGateOpen).toBe(false);
    expect(status.liveEnabled).toBe(false);
    expect(status.reason).toMatch(/OFF/i);
  });

  it("broker gate reads only the explicit human env attestation", () => {
    expect(brokerGateOpen()).toBe(false);
    process.env[BROKER_ENV] = "1";
    expect(brokerGateOpen()).toBe(true);
    process.env[BROKER_ENV] = "yes"; // anything other than "1" stays closed
    expect(brokerGateOpen()).toBe(false);
  });

  it("harness gate opens only when both order perms are allow-listed", async () => {
    const dir = await tmp();
    const partial = await writeSettings(dir, {
      allow: [HARNESS_ORDER_PERMISSIONS[0]],
    });
    expect(await harnessGateOpen({ settingsPaths: [partial] })).toBe(false);

    const full = await writeSettings(dir, OPEN_HARNESS);
    expect(await harnessGateOpen({ settingsPaths: [full] })).toBe(true);
  });

  it("a deny always wins over an allow (fail-safe)", async () => {
    const dir = await tmp();
    const file = await writeSettings(dir, {
      allow: [...HARNESS_ORDER_PERMISSIONS],
      deny: [HARNESS_ORDER_PERMISSIONS[0]],
    });
    expect(await harnessGateOpen({ settingsPaths: [file] })).toBe(false);
  });

  it("requires BOTH gates for liveEnabled", async () => {
    const dir = await tmp();
    const file = await writeSettings(dir, OPEN_HARNESS);
    const opts = { dataDir: dir, settingsPaths: [file] };

    // harness open, broker closed → still off
    expect((await getLiveTradingStatus(opts)).liveEnabled).toBe(false);

    process.env[BROKER_ENV] = "1";
    expect((await getLiveTradingStatus(opts)).liveEnabled).toBe(true);
  });

  it("disconnect latches live off even when both gates are open", async () => {
    const dir = await tmp();
    const file = await writeSettings(dir, OPEN_HARNESS);
    process.env[BROKER_ENV] = "1";
    const opts = { dataDir: dir, settingsPaths: [file] };

    expect((await getLiveTradingStatus(opts)).liveEnabled).toBe(true);

    await disconnectLive({ ...opts, reason: "test halt" });
    expect(await isDisconnected(opts)).toBe(true);
    const halted = await getLiveTradingStatus(opts);
    expect(halted.liveEnabled).toBe(false);
    expect(halted.disconnected).toBe(true);

    // Clearing the halt does not bypass the gates — it only removes the halt.
    await clearDisconnect(opts);
    expect(await isDisconnected(opts)).toBe(false);
    expect((await getLiveTradingStatus(opts)).liveEnabled).toBe(true);
  });

  it("assertLiveOrderAllowed blocks an order end-to-end when the gate is closed", async () => {
    const dir = await tmp();
    const opts = { dataDir: dir, settingsPaths: [path.join(dir, "settings.json")] };
    await expect(assertLiveOrderAllowed(opts)).rejects.toThrow(/blocked/i);
  });

  it("assertLiveOrderAllowed passes only when fully armed", async () => {
    const dir = await tmp();
    const file = await writeSettings(dir, OPEN_HARNESS);
    process.env[BROKER_ENV] = "1";
    await expect(
      assertLiveOrderAllowed({ dataDir: dir, settingsPaths: [file] }),
    ).resolves.toBeUndefined();
  });

  it("exposes no way for the agent to self-enable trading", () => {
    // The module surface must contain no enable/open/grant/arm export. The only
    // state change it permits is disconnect (the safe, halt-only direction).
    const forbidden = /^(enable|open|grant|arm|allow)/i;
    const dangerous = Object.keys(gate).filter(
      (k) => forbidden.test(k) && k !== "assertLiveOrderAllowed",
    );
    expect(dangerous).toEqual([]);
  });

  it("isTradingHalted reflects the kill-switch / disconnect halt", async () => {
    const dir = await tmp();
    const opts = { dataDir: dir, settingsPaths: [path.join(dir, "settings.json")] };
    expect(await isTradingHalted(opts)).toBe(false);
    await disconnectLive({ ...opts, reason: "kill switch" });
    expect(await isTradingHalted(opts)).toBe(true);
    await clearDisconnect(opts);
    expect(await isTradingHalted(opts)).toBe(false);
  });

  it("the order tools are named but never wired to a placement path", () => {
    expect([...LIVE_ORDER_TOOLS]).toEqual([
      "place_equity_order",
      "cancel_equity_order",
    ]);
  });
});
