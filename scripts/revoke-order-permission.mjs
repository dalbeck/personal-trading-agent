#!/usr/bin/env node
// Revoke the harness order permission — part of the M6 kill switch.
//
// Closes the harness gate by editing .claude/settings.json:
//   - removes the Robinhood order tools from permissions.allow
//   - ensures they are present in permissions.deny (a deny always wins)
//
// Idempotent and safe to run repeatedly. This is a HUMAN-run script (the agent
// cannot edit .claude/** — see planning/two-gate-live-trading.md), so it is the
// sanctioned way to slam the harness gate shut during an incident.
//
// Usage:  node scripts/revoke-order-permission.mjs [path-to-settings.json]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ORDER_TOOLS = [
  "mcp__robinhood-trading__place_equity_order",
  "mcp__robinhood-trading__cancel_equity_order",
];

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2] ?? path.join(root, ".claude", "settings.json");

let settings = {};
try {
  settings = JSON.parse(await readFile(file, "utf8"));
} catch {
  // Missing/unreadable — start from a minimal closed config.
  settings = { permissions: {} };
}

settings.permissions ??= {};
const perms = settings.permissions;
perms.allow = Array.isArray(perms.allow) ? perms.allow : [];
perms.deny = Array.isArray(perms.deny) ? perms.deny : [];

// Remove the order tools from allow.
perms.allow = perms.allow.filter((p) => !ORDER_TOOLS.includes(p));
// Ensure they are denied.
for (const tool of ORDER_TOOLS) {
  if (!perms.deny.includes(tool)) perms.deny.push(tool);
}

await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, `${JSON.stringify(settings, null, 2)}\n`, "utf8");

console.log(`Harness order permission revoked in ${file}`);
console.log(`  allow: ${perms.allow.length} entr${perms.allow.length === 1 ? "y" : "ies"}`);
console.log(`  deny:  order tools present (${ORDER_TOOLS.join(", ")})`);
