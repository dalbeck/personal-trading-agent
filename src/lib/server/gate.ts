import "server-only";

import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";

/**
 * The **two-gate** live-trading permission model (Phase 3 M2). Real-money
 * orders require BOTH gates open, AND no active disconnect halt:
 *
 *   1. **Broker gate** — the Robinhood Agentic account allows agent trading.
 *      Represented to the app by `ROBINHOOD_BROKER_TRADING_ENABLED=1`, a human
 *      attestation set in `.env` (a secret-tier action).
 *   2. **Harness gate** — the order tools (`place_equity_order` /
 *      `cancel_equity_order`) in the `.claude/settings.json` permission
 *      allow-list. The committed default *denies* them (defense-in-depth), and
 *      a `deny` always wins here, so opening the gate is a deliberate two-part
 *      human edit: remove the order tools from `deny` AND add them to `allow`.
 *      That same allow-list is what lets the Claude Code subprocess call those
 *      MCP tools at all.
 *
 * The agent can open **neither** gate: this module exposes no enable/open/grant
 * function, and `.claude/settings.json` denies the agent's own Edit/Write tools
 * on `.claude/**` — verified: the agent cannot grant itself order permission.
 * The broker gate lives in the Robinhood account itself, entirely outside this
 * repo. The only state-changing export here is {@link disconnectLive} — the
 * *safe* direction (it can only halt, never arm).
 *
 * `assertLiveOrderAllowed` is the single code gate every live-order path must
 * clear before a broker is ever called. Default-closed: with no env and no
 * settings edit, live trading is OFF.
 */

/** The Robinhood order tools. This build must never call these while the gate
 *  is closed; the read-only client (M1) has no path to them at all. */
export const LIVE_ORDER_TOOLS = [
  "place_equity_order",
  "cancel_equity_order",
] as const;

/** The harness allow-list permission ids that open the harness gate. */
export const HARNESS_ORDER_PERMISSIONS = LIVE_ORDER_TOOLS.map(
  (t) => `mcp__robinhood__${t}`,
);

export interface LiveTradingStatus {
  /** True only when both gates are open and no disconnect halt is active. */
  liveEnabled: boolean;
  brokerGateOpen: boolean;
  harnessGateOpen: boolean;
  /** True when a human (or the kill switch) has latched live trading off. */
  disconnected: boolean;
  /** Human-readable explanation of the current state (why off, or "armed"). */
  reason: string;
}

function repoRoot(opts?: { cwd?: string }): string {
  return opts?.cwd ?? process.cwd();
}

function defaultSettingsPaths(cwd: string): string[] {
  return [
    path.join(cwd, ".claude", "settings.json"),
    path.join(cwd, ".claude", "settings.local.json"),
  ];
}

function haltFlagPath(cwd: string, dataDir?: string): string {
  const root = dataDir ?? process.env.TRADING_DATA_DIR ?? path.join(cwd, "data");
  return path.join(root, "control", "live-halt.json");
}

interface GateOpts {
  cwd?: string;
  dataDir?: string;
  settingsPaths?: string[];
}

/* ------------------------------- broker gate ------------------------------- */

export function brokerGateOpen(): boolean {
  return process.env.ROBINHOOD_BROKER_TRADING_ENABLED === "1";
}

/* ------------------------------- harness gate ------------------------------ */

interface HarnessPermissions {
  allow: string[];
  deny: string[];
}

async function readHarnessPermissions(
  opts?: GateOpts,
): Promise<HarnessPermissions> {
  const cwd = repoRoot(opts);
  const paths = opts?.settingsPaths ?? defaultSettingsPaths(cwd);
  const allow: string[] = [];
  const deny: string[] = [];
  for (const p of paths) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(p, "utf8"));
    } catch {
      continue; // missing or unreadable settings file — skip
    }
    const perms = (parsed as { permissions?: { allow?: unknown; deny?: unknown } })
      .permissions;
    if (Array.isArray(perms?.allow)) {
      allow.push(...perms.allow.filter((x): x is string => typeof x === "string"));
    }
    if (Array.isArray(perms?.deny)) {
      deny.push(...perms.deny.filter((x): x is string => typeof x === "string"));
    }
  }
  return { allow, deny };
}

/**
 * The harness gate is open only when EVERY order-tool permission is present in
 * the allow-list and NONE is denied. A `deny` always wins, so the committed
 * default (which denies the order tools) keeps the gate closed even if a perm
 * is mistakenly allow-listed.
 */
export async function harnessGateOpen(opts?: GateOpts): Promise<boolean> {
  const { allow, deny } = await readHarnessPermissions(opts);
  const allowSet = new Set(allow);
  const denySet = new Set(deny);
  return HARNESS_ORDER_PERMISSIONS.every(
    (perm) => allowSet.has(perm) && !denySet.has(perm),
  );
}

/* ----------------------------- disconnect halt ----------------------------- */

export async function isDisconnected(opts?: GateOpts): Promise<boolean> {
  const file = haltFlagPath(repoRoot(opts), opts?.dataDir);
  try {
    await readFile(file, "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Latch live trading OFF (the one-click disconnect / kill direction). Safe by
 * construction: it can only *reduce* capability, never grant it. Writing the
 * halt forces `liveEnabled` false regardless of the gates.
 */
export async function disconnectLive(
  opts?: GateOpts & { reason?: string; at?: string },
): Promise<void> {
  const file = haltFlagPath(repoRoot(opts), opts?.dataDir);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    `${JSON.stringify(
      { haltedAt: opts?.at ?? new Date().toISOString(), reason: opts?.reason ?? "manual disconnect" },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

/**
 * Clear the disconnect halt. This does NOT arm live trading — it only removes
 * the app-level halt. Live stays OFF unless a human has opened both gates, so
 * this can never self-enable trading.
 */
export async function clearDisconnect(opts?: GateOpts): Promise<void> {
  const file = haltFlagPath(repoRoot(opts), opts?.dataDir);
  await rm(file, { force: true });
}

/* ------------------------------- aggregate -------------------------------- */

export async function getLiveTradingStatus(
  opts?: GateOpts,
): Promise<LiveTradingStatus> {
  const [harness, disconnected] = await Promise.all([
    harnessGateOpen(opts),
    isDisconnected(opts),
  ]);
  const broker = brokerGateOpen();
  const liveEnabled = broker && harness && !disconnected;

  let reason: string;
  if (liveEnabled) {
    reason = "Both gates open — live trading is armed.";
  } else if (disconnected) {
    reason = "Live trading disconnected (halt latched). Clear the halt to re-arm.";
  } else {
    const closed: string[] = [];
    if (!broker) closed.push("broker gate (Agentic account not trading-enabled)");
    if (!harness) closed.push("harness gate (order tools not allow-listed)");
    reason = `Live trading OFF — closed: ${closed.join(" and ")}.`;
  }

  return { liveEnabled, brokerGateOpen: broker, harnessGateOpen: harness, disconnected, reason };
}

/**
 * The single hard gate every live-order path must clear. Throws (fails closed)
 * unless both gates are open and no halt is latched. This is enforced in code,
 * so even the dashboard's own engine cannot reach a live broker while the gate
 * is closed.
 */
export async function assertLiveOrderAllowed(opts?: GateOpts): Promise<void> {
  const status = await getLiveTradingStatus(opts);
  if (!status.liveEnabled) {
    throw new Error(`Live order blocked: ${status.reason}`);
  }
}
