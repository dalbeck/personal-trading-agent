import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HARNESS_ORDER_PERMISSIONS } from "./gate";
import {
  buildPlaceOrderCliCommand,
  placeLiveOrder,
  routeApprovedOrder,
  submitTradeApproval,
  type ApprovalOrder,
} from "./live-order";
import type { ProposedOrder } from "@/lib/risk";
import type { PortfolioSnapshot } from "@/lib/types";

const BROKER_ENV = "ROBINHOOD_BROKER_TRADING_ENABLED";

async function tmp(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "pta-order-"));
}

/** A temp closed-gate config: empty settings path + temp data dir. */
async function closedGate() {
  const dir = await tmp();
  return { dataDir: dir, settingsPaths: [path.join(dir, "settings.json")] };
}

/** A temp OPEN-gate config: settings allow-list both order tools + broker env. */
async function openGate() {
  const dir = await tmp();
  const file = path.join(dir, "settings.json");
  await writeFile(
    file,
    JSON.stringify({ permissions: { allow: [...HARNESS_ORDER_PERMISSIONS] } }),
    "utf8",
  );
  process.env[BROKER_ENV] = "1";
  return { dataDir: dir, settingsPaths: [file] };
}

const PROPOSED: ProposedOrder = {
  symbol: "MSFT",
  action: "buy",
  side: "long",
  qty: 1,
  limitPrice: 100,
  orderType: "marketable_limit",
  stopPrice: 95,
  assetClass: "equity",
};

const ORDER: ApprovalOrder = {
  symbol: "MSFT",
  action: "buy",
  side: "long",
  qty: 1,
  limitPrice: 100,
  stopPrice: 95,
  takeProfit: 130,
  riskPct: 0.005,
  reviewDate: "2026-07-21",
  thesis: "Megacap leadership intact.",
  reasoning: "Pullback held the rising 50-day.",
  tags: ["test"],
  redTeam: { verdict: "approve", notes: "Survived the attack." },
};

async function journalFiles(dataDir: string): Promise<string[]> {
  try {
    return await readdir(path.join(dataDir, "decision-journal"));
  } catch {
    return [];
  }
}

beforeEach(() => delete process.env[BROKER_ENV]);
afterEach(() => delete process.env[BROKER_ENV]);

describe("order routing — the dry-run sink vs live", () => {
  it("routes to the dry-run sink (never Robinhood) while the gate is closed", async () => {
    const gate = await closedGate();
    const placed = await routeApprovedOrder(PROPOSED, {
      ...gate,
      mockOrderId: "mock-1",
    });
    expect(placed.dryRun).toBe(true);
    expect(placed.destination).toBe("mock"); // no Alpaca creds in test env
    expect(placed.destination).not.toBe("robinhood");
    expect(placed.brokerOrderId).toBe("mock-1");
  });

  it("placeLiveOrder is wired but unreachable while the gate is closed", async () => {
    const gate = await closedGate();
    await expect(placeLiveOrder(PROPOSED, gate)).rejects.toThrow(/blocked/i);
  });

  it("routes to the live Robinhood path only when both gates are open", async () => {
    const gate = await openGate();
    let sentToLive: ProposedOrder | null = null;
    const placed = await routeApprovedOrder(PROPOSED, {
      ...gate,
      placeLive: async (o) => {
        sentToLive = o;
        return { destination: "robinhood", brokerOrderId: "rh-1" };
      },
    });
    expect(placed.dryRun).toBe(false);
    expect(placed.destination).toBe("robinhood");
    expect(sentToLive).not.toBeNull();
  });
});

describe("buildPlaceOrderCliCommand — places one order, safe by construction (M5b)", () => {
  const { cmd, args } = buildPlaceOrderCliCommand("1AB23456", PROPOSED);
  const joined = args.join(" ");
  const allowIdx = args.indexOf("--allowedTools");
  const disallowIdx = args.indexOf("--disallowedTools");
  const allowed = args.slice(allowIdx + 1, disallowIdx);

  it("spawns the host claude CLI in print mode", () => {
    expect(cmd).toBe("claude");
    expect(args[0]).toBe("-p");
  });

  it("allow-lists ONLY place_equity_order, namespaced to the real MCP server", () => {
    expect(allowed).toEqual(["mcp__robinhood-trading__place_equity_order"]);
  });

  it("disallows enumeration, cancel, and option-order tools", () => {
    for (const t of [
      "get_accounts",
      "cancel_equity_order",
      "place_option_order",
      "cancel_option_order",
    ]) {
      const id = `mcp__robinhood-trading__${t}`;
      expect(allowed).not.toContain(id);
      expect(joined).toContain(id); // explicitly disallowed
    }
  });

  it("references only the one account and the order params, and asks for one order", () => {
    expect(joined).toContain("1AB23456");
    expect(joined).toContain("MSFT");
    expect(joined).toMatch(/EXACTLY ONE/);
    expect(joined).toMatch(/Do NOT|do NOT/);
  });
});

describe("placeLiveOrder is unreachable while the gate is closed (M5b)", () => {
  it("throws (never spawns / places) with the gate closed", async () => {
    const gate = await closedGate();
    await expect(placeLiveOrder(PROPOSED, gate)).rejects.toThrow();
  });
});

describe("per-trade approval", () => {
  it("denial journals a human rejection and places nothing", async () => {
    const gate = await closedGate();
    const res = await submitTradeApproval(
      {
        order: ORDER,
        decision: "deny",
        approver: "human",
        timestamp: "2026-06-24T10:00:00-04:00",
        reason: "Crowded; passing.",
      },
      gate,
    );
    expect(res.outcome).toBe("denied");
    expect(res.brokerOrderId).toBeUndefined();
    const files = await journalFiles(gate.dataDir);
    expect(files.some((f) => f.includes("rejection"))).toBe(true);
  });

  it("an approved order lands in the dry-run sink and is journaled, gate closed", async () => {
    const gate = await closedGate();
    const res = await submitTradeApproval(
      {
        order: ORDER,
        decision: "approve",
        approver: "human",
        timestamp: "2026-06-24T10:00:00-04:00",
      },
      { ...gate, snapshot: null, mockOrderId: "mock-42" },
    );
    expect(res.outcome).toBe("approved");
    expect(res.dryRun).toBe(true);
    expect(res.destination).toBe("mock");
    expect(res.destination).not.toBe("robinhood");

    // The journal proves the human approval + the dry-run routing.
    const files = await journalFiles(gate.dataDir);
    const trade = files.find((f) => f.includes("msft-buy"));
    expect(trade).toBeDefined();
    const body = await readFile(
      path.join(gate.dataDir, "decision-journal", trade!),
      "utf8",
    );
    expect(body).toMatch(/Approved by human/);
    expect(body).toMatch(/dry-run sink/);
    expect(body).not.toMatch(/robinhood/i);
  });

  it("an approvable LIVE order, gate closed, routes to the dry-run sink — never Robinhood", async () => {
    // M5a: live proposals are now approvable, but the GATE is the real-money
    // boundary. Gate closed → the human-approved live order lands in the
    // dry-run sink (paper/mock), proving no real Robinhood order is reachable.
    const gate = await closedGate();
    let reachedRobinhood = false;
    const res = await submitTradeApproval(
      {
        order: { ...ORDER, account: "live" },
        decision: "approve",
        approver: "human",
        timestamp: "2026-06-24T10:00:00-04:00",
      },
      {
        ...gate,
        snapshot: null,
        mockOrderId: "mock-live",
        placeLive: async () => {
          reachedRobinhood = true;
          return { destination: "robinhood", brokerOrderId: "rh-nope" };
        },
      },
    );
    expect(res.outcome).toBe("approved");
    expect(res.dryRun).toBe(true);
    expect(res.destination).not.toBe("robinhood");
    expect(reachedRobinhood).toBe(false);
  });

  it("a red-team reject can never be approved into an order", async () => {
    const gate = await closedGate();
    const res = await submitTradeApproval(
      {
        order: { ...ORDER, redTeam: { verdict: "reject", notes: "Thesis fails." } },
        decision: "approve",
        approver: "human",
        timestamp: "2026-06-24T10:00:00-04:00",
      },
      gate,
    );
    expect(res.outcome).toBe("blocked-redteam");
    expect(res.brokerOrderId).toBeUndefined();
  });

  it("re-runs the risk gate at approval and blocks a breaching order", async () => {
    const gate = await closedGate();
    // Tiny equity → the order is far more than 20% of the account.
    const snapshot = {
      account: "paper",
      asOf: "2026-06-24T10:00:00-04:00",
      currency: "USD",
      equity: 100,
      cash: 100,
      buyingPower: 100,
      totalPl: 0,
      totalPlPct: 0,
      dayPl: 0,
      dayPlPct: 0,
      positions: [],
      equityCurve: [],
    } as PortfolioSnapshot;
    const res = await submitTradeApproval(
      {
        order: ORDER,
        decision: "approve",
        approver: "human",
        timestamp: "2026-06-24T10:00:00-04:00",
      },
      { ...gate, snapshot },
    );
    expect(res.outcome).toBe("blocked-risk");
    expect(res.brokerOrderId).toBeUndefined();
  });

  it("enforces the live caps on the live path and blocks an over-exposed order", async () => {
    const gate = await openGate();
    let reachedBroker = false;
    const res = await submitTradeApproval(
      {
        // 100 @ $50 = $5,000 — far over the $500 account exposure ceiling.
        order: { ...ORDER, qty: 100, limitPrice: 50, riskPct: 0.01 },
        decision: "approve",
        approver: "human",
        timestamp: "2026-06-24T10:00:00-04:00",
      },
      {
        ...gate,
        snapshot: null, // skip the paper risk recheck; isolate the live caps
        liveSnapshot: null, // unfunded live account → funded capital 0
        placeLive: async () => {
          reachedBroker = true;
          return { destination: "robinhood", brokerOrderId: "rh-x" };
        },
      },
    );
    expect(res.outcome).toBe("blocked-caps");
    expect(reachedBroker).toBe(false); // never reached the broker
  });

  it("surfaces a broker rejection as a clean error, not a crash", async () => {
    const gate = await closedGate();
    const res = await submitTradeApproval(
      {
        order: ORDER,
        decision: "approve",
        approver: "human",
        timestamp: "2026-06-24T10:00:00-04:00",
      },
      {
        ...gate,
        snapshot: null,
        placeDryRun: async () => {
          throw new Error("Alpaca order rejected → 403 not allowed to short");
        },
      },
    );
    expect(res.outcome).toBe("error");
    expect(res.error).toMatch(/not allowed to short/);
    expect(res.brokerOrderId).toBeUndefined();
    expect(res.dryRun).toBe(true);
  });

  it("routes an approved order to Robinhood only with both gates open", async () => {
    const gate = await openGate();
    const res = await submitTradeApproval(
      {
        order: ORDER,
        decision: "approve",
        approver: "human",
        timestamp: "2026-06-24T10:00:00-04:00",
      },
      {
        ...gate,
        snapshot: null,
        // A funded live account that clears the M4 exposure / funded caps.
        liveSnapshot: {
          account: "live",
          asOf: "2026-06-24T10:00:00-04:00",
          currency: "USD",
          equity: 500,
          cash: 500,
          buyingPower: 500,
          totalPl: 0,
          totalPlPct: 0,
          dayPl: 0,
          dayPlPct: 0,
          positions: [],
          equityCurve: [],
        },
        placeLive: async () => ({
          destination: "robinhood",
          brokerOrderId: "rh-99",
        }),
      },
    );
    expect(res.outcome).toBe("approved");
    expect(res.dryRun).toBe(false);
    expect(res.destination).toBe("robinhood");
    expect(res.brokerOrderId).toBe("rh-99");

    const files = await journalFiles(gate.dataDir);
    const trade = files.find((f) => f.includes("msft-buy"))!;
    const body = await readFile(
      path.join(gate.dataDir, "decision-journal", trade),
      "utf8",
    );
    expect(body).toMatch(/routed to robinhood/);
    expect(body).not.toMatch(/dry-run sink/);
  });
});
