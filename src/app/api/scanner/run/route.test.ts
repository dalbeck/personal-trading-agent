import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The scanner run endpoint resolves a {preset, filters} request into bounded
 * filters, runs the scan, and maps unavailable/failed scans to the right status.
 * Mocks keep it hermetic — no CLI spawn, no env.
 */
const runScan = vi.fn();

vi.mock("@/lib/server/scanner", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, runScan: (...a: unknown[]) => runScan(...a) };
});

import { POST } from "./route";
import { ScannerUnavailableError } from "@/lib/server/scanner";

const call = (body: unknown) =>
  POST(
    new Request("http://localhost/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

afterEach(() => vi.clearAllMocks());

describe("POST /api/scanner/run", () => {
  it("runs a preset scan and returns results + resolved filters", async () => {
    runScan.mockResolvedValue([{ symbol: "NVDA" }]);
    const res = await call({ preset: "trend" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.preset).toBe("trend");
    expect(data.count).toBe(1);
    // The trend preset's filters were resolved + passed to the engine.
    expect(data.filters.minMarketCap).toBe(2_000_000_000);
    expect(runScan).toHaveBeenCalledOnce();
  });

  it("defaults an unknown preset to trend and clamps custom filters", async () => {
    runScan.mockResolvedValue([]);
    const res = await call({ preset: "bogus", filters: { rsiMax: 999, limit: 9999 } });
    const data = await res.json();
    expect(data.preset).toBe("trend");
    expect(data.filters.rsiMax).toBe(100);
    expect(data.filters.limit).toBeLessThanOrEqual(50);
  });

  it("400s on an invalid JSON body", async () => {
    const res = await POST(
      new Request("http://localhost/x", { method: "POST" }),
    );
    expect(res.status).toBe(400);
    expect(runScan).not.toHaveBeenCalled();
  });

  it("403s when the scanner is disabled", async () => {
    runScan.mockRejectedValue(
      new ScannerUnavailableError("off", "disabled"),
    );
    const res = await call({ preset: "value" });
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("disabled");
  });

  it("409s when no Robinhood account is connected", async () => {
    runScan.mockRejectedValue(
      new ScannerUnavailableError("not connected", "disconnected"),
    );
    const res = await call({ preset: "value" });
    expect(res.status).toBe(409);
  });

  it("502s when the scan itself fails", async () => {
    runScan.mockRejectedValue(new Error("CLI timed out"));
    const res = await call({ preset: "trend" });
    expect(res.status).toBe(502);
  });
});
