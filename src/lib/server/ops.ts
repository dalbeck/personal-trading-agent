import "server-only";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ROUTINE_IDS } from "@/lib/schemas";
import { findOpsAction, type OpsActionMeta } from "@/lib/ops";

/**
 * Server-only half of the Operations control panel.
 *
 * Maps an allowlisted action ID → a FIXED step vector. Every command is a fixed
 * absolute binary (`/bin/bash <repo>/scripts/<x>.sh` or `/bin/launchctl`) with a
 * fixed argument array. The client only ever names an action ID; no client
 * string is interpolated into a command, and nothing is ever run through a
 * shell (`spawn(..., { shell: false })` at the call site).
 *
 * See `src/lib/ops.ts` for the allowlist + the security contract.
 */

export interface OpsStep {
  /** A fixed binary path — never client-supplied. */
  command: string;
  /** Fixed argument vector — never client-supplied. */
  args: string[];
}

const BASH = "/bin/bash";
const LAUNCHCTL = "/bin/launchctl";

/** A repo script invoked shell-free via bash with a FIXED argument tail. */
function script(name: string, ...args: string[]): OpsStep {
  return {
    command: BASH,
    args: [path.join(process.cwd(), "scripts", name), ...args],
  };
}

/** The com.tradingdesk.* launchd plists currently installed (read-only scan). */
async function deskPlists(): Promise<string[]> {
  const dir = path.join(os.homedir(), "Library", "LaunchAgents");
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((f) => /^com\.tradingdesk\.[A-Za-z0-9._-]+\.plist$/.test(f))
    .sort()
    .map((f) => path.join(dir, f));
}

function deskStep(verb: "bootstrap" | "bootout", plist: string): OpsStep {
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  return { command: LAUNCHCTL, args: [verb, `gui/${uid}`, plist] };
}

/**
 * Resolve an action ID to its metadata, or `null` if it is not on the
 * allowlist. THIS is the security gate the route relies on — an unknown ID, a
 * path, a traversal string, or a prototype key all return `null`.
 */
export function resolveOpsAction(id: unknown): OpsActionMeta | null {
  if (typeof id !== "string") return null;
  return findOpsAction(id) ?? null;
}

/**
 * Build the fixed step(s) for an allowlisted action ID. Throws on anything not
 * on the allowlist — callers MUST have already cleared `resolveOpsAction`.
 */
export async function buildOpsSteps(id: string): Promise<OpsStep[]> {
  switch (id) {
    case "preflight":
      return [script("preflight.sh")];
    case "preflight-shakedown":
      return [script("preflight.sh", "--shakedown")];
    case "backup-dry-run":
      return [script("backup.sh", "--dry-run")];
    case "backup":
      return [script("backup.sh")];
    case "install-routines":
      return [script("install-routines.sh")];
    case "clear-seed-data":
      return [script("clear-seed-data.sh")];
    case "reset-desk-data":
      return [script("reset-desk-data.sh")];
    case "kill-switch":
      return [script("kill-switch.sh")];
    case "desk-start":
      return (await deskPlists()).map((p) => deskStep("bootstrap", p));
    case "desk-stop":
      return (await deskPlists()).map((p) => deskStep("bootout", p));
    default: {
      // The only parameterized family: `routine:<id>` where <id> is itself an
      // allowlisted routine. The routine ID comes from ROUTINE_IDS, never raw
      // client text — an unknown routine throws rather than running anything.
      const m = /^routine:(.+)$/.exec(id);
      if (m && (ROUTINE_IDS as readonly string[]).includes(m[1])) {
        return [script("run-routine.sh", m[1])];
      }
      throw new Error(`refused: not an allowlisted ops action: ${id}`);
    }
  }
}
