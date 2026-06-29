import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  isStrategyDoc,
  listStrategyDocs,
  readStrategyDoc,
} from "./strategy";

const STRATEGY_DIR = path.join(process.cwd(), "strategy");
const opts = { strategyDir: STRATEGY_DIR };

describe("listStrategyDocs — data-driven from the sleeve registry", () => {
  const docs = listStrategyDocs();
  const byDoc = Object.fromEntries(docs.map((d) => [d.doc, d]));

  it("lists the swing charter, both new sleeve charters, the safety envelope, and the playbook", () => {
    expect(docs.map((d) => d.doc)).toEqual([
      "charter",
      "charters/position-mid",
      "charters/core-long",
      "charters/README",
      "playbook",
    ]);
  });

  it("groups the swing charter under one row serving both swing sleeves, enabled", () => {
    expect(byDoc["charter"]).toMatchObject({
      title: "Swing charter",
      group: "Charters",
      sleeve: { ids: ["swing-trend", "swing-value"], horizon: "swing", enabled: true },
    });
  });

  it("labels the new sleeves with horizon + disabled state", () => {
    expect(byDoc["charters/position-mid"].sleeve).toMatchObject({
      ids: ["position-mid"],
      horizon: "mid",
      enabled: false,
    });
    expect(byDoc["charters/core-long"].sleeve).toMatchObject({
      ids: ["core-long"],
      horizon: "long",
      enabled: false,
    });
  });

  it("marks the safety envelope + playbook as non-sleeve docs", () => {
    expect(byDoc["charters/README"].sleeve).toBeNull();
    expect(byDoc["charters/README"].title).toBe("Safety envelope");
    expect(byDoc["playbook"].group).toBe("Playbook");
    expect(byDoc["playbook"].sleeve).toBeNull();
  });
});

describe("path-traversal guard stays after generalization", () => {
  it("accepts only the registered ids", () => {
    expect(isStrategyDoc("charter")).toBe(true);
    expect(isStrategyDoc("charters/core-long")).toBe(true);
    expect(isStrategyDoc("playbook")).toBe(true);
  });

  it("rejects unregistered + traversal ids", () => {
    expect(isStrategyDoc("charters/secret")).toBe(false);
    expect(isStrategyDoc("../package")).toBe(false);
    expect(isStrategyDoc("charter/../../etc/passwd")).toBe(false);
    expect(isStrategyDoc("")).toBe(false);
  });

  it("throws (never reads) a non-registered path", async () => {
    await expect(readStrategyDoc("../package.json", opts)).rejects.toThrow(
      /Unknown strategy doc/,
    );
  });
});

describe("registered-but-missing charter reads empty (back-compat)", () => {
  it("returns the swing charter content for the existing file", async () => {
    const txt = await readStrategyDoc("charter", opts);
    expect(txt.length).toBeGreaterThan(0);
  });

  it("reads the core-long (M3) and position-mid (M4) charters", async () => {
    expect((await readStrategyDoc("charters/core-long", opts)).length).toBeGreaterThan(0);
    expect((await readStrategyDoc("charters/position-mid", opts)).length).toBeGreaterThan(0);
  });
});
