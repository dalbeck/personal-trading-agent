// src/lib/server/research/diagnostics.test.ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  diagnosticToStatus,
  readResearchDiagnostics,
  recordResearchDiagnostic,
  researchReasonText,
  type ResearchDiagnostic,
} from "./diagnostics";

function diag(over: Partial<ResearchDiagnostic> = {}): ResearchDiagnostic {
  return {
    at: "2026-06-27T12:00:00.000Z",
    provider: "perplexity",
    symbol: "LLY",
    outcome: "ok",
    latencyMs: 1234,
    ...over,
  };
}

describe("researchReasonText", () => {
  it("returns null when ok", () => {
    expect(researchReasonText(diag({ outcome: "ok" }))).toBeNull();
  });
  it("names the HTTP status and flags billing for 402", () => {
    expect(
      researchReasonText(diag({ outcome: "http-error", httpStatus: 402 })),
    ).toBe("HTTP 402 (check API billing)");
  });
  it("names a non-billing HTTP status plainly", () => {
    expect(
      researchReasonText(diag({ outcome: "http-error", httpStatus: 503 })),
    ).toBe("HTTP 503");
  });
  it("describes a missing key, cap, timeout, parse and network", () => {
    expect(researchReasonText(diag({ outcome: "no-api-key" }))).toBe(
      "no API key configured",
    );
    expect(researchReasonText(diag({ outcome: "daily-cap-reached" }))).toBe(
      "daily research cap reached",
    );
    expect(researchReasonText(diag({ outcome: "timeout" }))).toBe(
      "timed out (35s)",
    );
    expect(researchReasonText(diag({ outcome: "parse-error" }))).toBe(
      "response parse error",
    );
    expect(researchReasonText(diag({ outcome: "network-error" }))).toBe(
      "network error",
    );
  });
});

describe("diagnosticToStatus", () => {
  it("maps outcomes to the coarse PerplexityStatus", () => {
    expect(diagnosticToStatus(diag({ outcome: "ok" }))).toBe("ok");
    expect(diagnosticToStatus(diag({ outcome: "provider-off" }))).toBe("off");
    expect(diagnosticToStatus(diag({ outcome: "daily-cap-reached" }))).toBe(
      "capped",
    );
    expect(diagnosticToStatus(diag({ outcome: "no-api-key" }))).toBe(
      "unavailable",
    );
    expect(
      diagnosticToStatus(diag({ outcome: "http-error", httpStatus: 402 })),
    ).toBe("unavailable");
    expect(diagnosticToStatus(diag({ outcome: "timeout" }))).toBe("unavailable");
  });
});

describe("ring persistence", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "diag-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns [] when nothing is recorded", async () => {
    expect(await readResearchDiagnostics({ dataDir: dir })).toEqual([]);
  });

  it("prepends newest-first and caps at 20", async () => {
    for (let i = 0; i < 25; i++) {
      await recordResearchDiagnostic(
        diag({ latencyMs: i, at: `2026-06-27T12:00:${String(i).padStart(2, "0")}.000Z` }),
        { dataDir: dir },
      );
    }
    const all = await readResearchDiagnostics({ dataDir: dir });
    expect(all).toHaveLength(20);
    expect(all[0].latencyMs).toBe(24); // newest first
    expect(all[19].latencyMs).toBe(5); // oldest kept
  });

  it("never throws on an unreadable file", async () => {
    await rm(dir, { recursive: true, force: true }); // dir gone
    await expect(
      recordResearchDiagnostic(diag(), { dataDir: dir }),
    ).resolves.toBeUndefined();
  });
});
