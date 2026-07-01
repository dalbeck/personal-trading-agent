import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Scanner CLI-bridge safety + behavior. The pure builder/mapper carry the
 * security-critical invariants (only the scanner tool is allow-listed, every
 * order/enumeration tool is disallowed, no account is referenced). The
 * orchestrator is gated on the feature flag + a live connection. The Robinhood
 * connection check is mocked so the test never touches a real env/MCP, while the
 * REAL `FORBIDDEN_TOOLS` list is kept.
 */
const hasRobinhoodConnection = vi.fn(() => true);

vi.mock("@/lib/server/robinhood", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, hasRobinhoodConnection: () => hasRobinhoodConnection() };
});

import { FORBIDDEN_TOOLS } from "./robinhood";
import {
  SCANNER_TOOL,
  SCANNER_TOOLS,
  ScannerUnavailableError,
  buildScannerCliCommand,
  mapScannerResults,
  runScan,
} from "./scanner";
import { filtersForPreset } from "@/lib/scanner";

const filters = filtersForPreset("trend");

afterEach(() => {
  vi.unstubAllEnvs();
  hasRobinhoodConnection.mockReturnValue(true);
});

describe("buildScannerCliCommand", () => {
  it("spawns the host claude CLI (argv, not a shell)", () => {
    const { cmd, args } = buildScannerCliCommand(filters);
    expect(cmd).toBe("claude");
    expect(args[0]).toBe("-p");
  });

  it("allow-lists ONLY the scan-management family — no order/enumeration tool", () => {
    const { args } = buildScannerCliCommand(filters);
    const allowIdx = args.indexOf("--allowedTools");
    const disallowIdx = args.indexOf("--disallowedTools");
    const allowed = args.slice(allowIdx + 1, disallowIdx);
    expect(allowed).toEqual(
      SCANNER_TOOLS.map((t) => `mcp__robinhood-trading__${t}`),
    );
    // The primary run tool is present...
    expect(allowed).toContain(`mcp__robinhood-trading__${SCANNER_TOOL}`);
    // ...and NO forbidden tool leaks into the allow-list.
    for (const forbidden of FORBIDDEN_TOOLS) {
      expect(allowed).not.toContain(`mcp__robinhood-trading__${forbidden}`);
    }
  });

  it("explicitly disallows every order / enumeration tool", () => {
    const { args } = buildScannerCliCommand(filters);
    const joined = args.join(" ");
    for (const forbidden of FORBIDDEN_TOOLS) {
      expect(joined).toContain(`mcp__robinhood-trading__${forbidden}`);
    }
    // The option-order tools specifically must be on the disallow list.
    expect(joined).toContain("mcp__robinhood-trading__place_option_order");
    expect(joined).toContain("mcp__robinhood-trading__cancel_option_order");
  });

  it("references NO brokerage account and forbids orders in the prompt", () => {
    const prompt = buildScannerCliCommand(filters).args[1];
    expect(prompt).toMatch(/do not place or cancel any order/i);
    expect(prompt).toMatch(/do not.*get_accounts/i);
    expect(prompt).not.toMatch(/account_number/i);
  });
});

describe("mapScannerResults", () => {
  it("coerces rows, drops invalid symbols, dedupes, and caps to the limit", () => {
    const raw = [
      {
        symbol: "nvda",
        sector: "Technology",
        price: 120.5,
        rsi: 64,
        relative_volume: 1.8,
        earnings_date: "2026-07-24",
        market_cap: 3.2e12,
        pe_ratio: 55,
      },
      { symbol: "NVDA", price: 121 }, // duplicate → dropped
      { symbol: "!!!", price: 1 }, // invalid symbol → dropped
      { symbol: "MSFT", price: null, rsi: null }, // valid, sparse
    ];
    const out = mapScannerResults(raw, 10);
    expect(out.map((r) => r.symbol)).toEqual(["NVDA", "MSFT"]);
    expect(out[0]).toMatchObject({
      symbol: "NVDA",
      sector: "Technology",
      price: 120.5,
      relativeVolume: 1.8,
      earningsDate: "2026-07-24",
    });
    expect(out[1].price).toBeNull();
  });

  it("coerces Robinhood's string cells (incl. scientific notation) and the ticker alias", () => {
    // The raw wire shape: rows keyed by `ticker`, numeric cells as strings.
    const raw = [
      {
        ticker: "BTI",
        price: "61.905",
        rsi: "57.23420782809031",
        relative_volume: "2.7356",
        market_cap: "1.34487523485e+11",
        pe_ratio: "",
      },
    ];
    const out = mapScannerResults(raw, 10);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("BTI");
    expect(out[0].price).toBeCloseTo(61.905);
    expect(out[0].rsi).toBeCloseTo(57.2342);
    expect(out[0].marketCap).toBeCloseTo(1.34487523485e11);
    // Empty-string cell → null, never a spurious 0.
    expect(out[0].peRatio).toBeNull();
  });

  it("respects the row cap", () => {
    const raw = Array.from({ length: 5 }, (_, i) => ({ symbol: `AA${i}` }));
    expect(mapScannerResults(raw, 2)).toHaveLength(2);
  });

  it("returns [] for non-array / garbage input", () => {
    expect(mapScannerResults(null, 10)).toEqual([]);
    expect(mapScannerResults({ not: "an array" }, 10)).toEqual([]);
  });
});

describe("runScan gating", () => {
  it("throws 'disabled' when SCANNER_ENABLED is not set", async () => {
    vi.stubEnv("SCANNER_ENABLED", "");
    await expect(runScan(filters, { fetch: async () => [] })).rejects.toMatchObject(
      { name: "ScannerUnavailableError", reason: "disabled" },
    );
  });

  it("throws 'disconnected' when no Robinhood account is connected", async () => {
    vi.stubEnv("SCANNER_ENABLED", "1");
    hasRobinhoodConnection.mockReturnValue(false);
    await expect(runScan(filters, { fetch: async () => [] })).rejects.toBeInstanceOf(
      ScannerUnavailableError,
    );
  });

  it("runs and maps results when enabled + connected", async () => {
    vi.stubEnv("SCANNER_ENABLED", "1");
    hasRobinhoodConnection.mockReturnValue(true);
    const out = await runScan(filters, {
      fetch: async () => [{ symbol: "SNOW", price: 252 }],
    });
    expect(out).toEqual([
      {
        symbol: "SNOW",
        sector: null,
        price: 252,
        rsi: null,
        relativeVolume: null,
        earningsDate: null,
        marketCap: null,
        peRatio: null,
      },
    ]);
  });
});
