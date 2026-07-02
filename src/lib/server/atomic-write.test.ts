import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { atomicWrite } from "./atomic-write";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-atomic-"));
}

describe("atomicWrite", () => {
  it("writes the exact content and creates the parent dir", async () => {
    const dir = await tmp();
    const file = path.join(dir, "nested", "a.json");
    await atomicWrite(file, '{"x":1}\n');
    expect(await readFile(file, "utf8")).toBe('{"x":1}\n');
  });

  it("overwrites an existing file", async () => {
    const dir = await tmp();
    const file = path.join(dir, "a.txt");
    await atomicWrite(file, "old");
    await atomicWrite(file, "new");
    expect(await readFile(file, "utf8")).toBe("new");
  });

  it("leaves no *.tmp file behind on success", async () => {
    const dir = await tmp();
    await atomicWrite(path.join(dir, "a.txt"), "hi");
    const names = await readdir(dir);
    expect(names.some((n) => n.includes(".tmp"))).toBe(false);
    expect(names).toContain("a.txt");
  });

  it("never leaves a partial target (the temp file is renamed, not appended)", async () => {
    const dir = await tmp();
    const file = path.join(dir, "a.txt");
    await writeFile(file, "intact-old", "utf8");
    await atomicWrite(file, "intact-new");
    // The content is exactly one of the two whole values, never a mix.
    expect(["intact-old", "intact-new"]).toContain(await readFile(file, "utf8"));
  });
});
