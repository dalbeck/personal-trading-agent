import { ROUTINE_IDS } from "@/lib/schemas";

/**
 * Operations control-panel catalog — the **allowlist of action IDs** the
 * Operations view can run server-side.
 *
 * This module is the client-safe half (display metadata only). The server-only
 * sibling `src/lib/server/ops.ts` maps each ID to a FIXED `{ command, args }`
 * step vector and spawns it shell-free. Nothing here — and nothing the client
 * sends — is ever interpolated into a command: the client only ever names an
 * action **ID**, which must match one of these entries exactly.
 *
 * Security contract (see `.agents/nextjs.md` "Server-side command execution"
 * and `planning/preflight-and-ergonomics-spec.md`):
 *  - Allowlist only — no client-supplied path / name / args.
 *  - Nothing here may open the live-trading gate or fund the account. The
 *    dashboard may only *close* (kill switch) / *stop*, never *open* / *arm*.
 *  - `restore.sh` (can clobber the live journal) and dev/git scripts are
 *    deliberately excluded.
 */

export type OpsGroup =
  | "Preflight"
  | "Routines"
  | "Backup"
  | "Data"
  | "Schedule"
  | "Emergency";

export interface OpsConfirm {
  title: string;
  body: string;
  confirmLabel: string;
}

export interface OpsActionMeta {
  /** Stable action ID — the ONLY thing the client sends. */
  id: string;
  label: string;
  group: OpsGroup;
  description: string;
  /** Destructive / system-changing → red styling + a confirm dialog. */
  danger: boolean;
  /** Present → the UI must confirm via AlertDialog before running. */
  confirm?: OpsConfirm;
}

/** The five scheduled routines, each as its own discrete allowlisted action. */
const routineActions: OpsActionMeta[] = ROUTINE_IDS.map((id) => ({
  id: `routine:${id}`,
  label: id,
  group: "Routines",
  description: `Trigger the ${id} routine now (paper). Runs the code-gated pipeline: propose → risk rails → red-team → journal.`,
  danger: false,
}));

export const OPS_ACTIONS: OpsActionMeta[] = [
  {
    id: "preflight",
    label: "Preflight check",
    group: "Preflight",
    description:
      "Readiness check: .env + Alpaca auth, dashboard, data/, launchd, charter, timezone. No side effects.",
    danger: false,
  },
  {
    id: "preflight-shakedown",
    label: "Preflight + shakedown",
    group: "Preflight",
    description:
      "Preflight, then fire pre-market-research end-to-end and report the artifacts written (paper).",
    danger: false,
    confirm: {
      title: "Run preflight + shakedown?",
      body: "This fires the pre-market-research routine end-to-end against the PAPER account (no real money). It exercises the full propose → gates → journal path and may write proposals/journal entries.",
      confirmLabel: "Run shakedown",
    },
  },
  ...routineActions,
  {
    id: "backup-dry-run",
    label: "Backup (dry-run)",
    group: "Backup",
    description:
      "Preview what an encrypted data/ → R2 backup would upload. No changes.",
    danger: false,
  },
  {
    id: "backup",
    label: "Backup now",
    group: "Backup",
    description: "Encrypt and upload data/ to Cloudflare R2. Idempotent.",
    danger: false,
    confirm: {
      title: "Run backup now?",
      body: "Encrypts data/ client-side and uploads it to Cloudflare R2. Safe and idempotent, but it makes a network upload.",
      confirmLabel: "Back up now",
    },
  },
  {
    id: "clear-seed-data",
    label: "Clear sample data",
    group: "Data",
    description:
      "Remove sample-flagged seed files (proposals, news) from data/ so the dashboard shows its honest empty states. Live records (sample omitted / false) are untouched.",
    danger: true,
    confirm: {
      title: "Clear sample data?",
      body: "Permanently deletes sample-flagged seed files (proposals, news) from data/. Live records are left untouched. The affected views fall back to their real empty states. Idempotent.",
      confirmLabel: "Clear sample data",
    },
  },
  {
    id: "reset-desk-data",
    label: "Reset desk data",
    group: "Data",
    description:
      "Clear ALL desk artifacts (journal, coaching, snapshots, proposals, news, fills, logs, research) from the app's data directory so every panel shows its honest empty state. Deletes live records too — the kill-switch HALT and funding latches are not touched. Idempotent.",
    danger: true,
    confirm: {
      title: "Reset desk data?",
      body: "Permanently deletes EVERY desk artifact — including live journal, coaching, snapshots, proposals, news, fills, logs, and research — from the directory the app reads from. The trading HALT latch and funding tracker are preserved. This cannot be undone. Use this to return the desk to a clean slate; use “Clear sample data” to remove only seeded demo files.",
      confirmLabel: "Reset desk data",
    },
  },
  {
    id: "install-routines",
    label: "Install routine plists",
    group: "Schedule",
    description:
      "Write the five com.tradingdesk.* launchd plists to ~/Library/LaunchAgents. Does NOT load them.",
    danger: false,
    confirm: {
      title: "Install routine plists?",
      body: "Writes the five launchd plists to ~/Library/LaunchAgents. It does NOT load them — loading the schedule stays a deliberate manual step.",
      confirmLabel: "Install plists",
    },
  },
  {
    id: "desk-start",
    label: "Start autonomous paper desk",
    group: "Schedule",
    description:
      "Load (bootstrap) the scheduled routine launchd jobs. Starts autonomous PAPER trading on the ET schedule. Reversible.",
    danger: true,
    confirm: {
      title: "Start the autonomous paper desk?",
      body: "Loads the scheduled routine launchd jobs. This STARTS autonomous PAPER trading on the ET schedule (no real money). Reversible with Stop.",
      confirmLabel: "Start paper desk",
    },
  },
  {
    id: "desk-stop",
    label: "Stop autonomous paper desk",
    group: "Schedule",
    description:
      "Unload (boot out) the scheduled routine launchd jobs. The desk stops running on a schedule.",
    danger: false,
    confirm: {
      title: "Stop the autonomous paper desk?",
      body: "Unloads the scheduled routine launchd jobs. The desk will no longer run on its ET schedule until you start it again.",
      confirmLabel: "Stop paper desk",
    },
  },
  {
    id: "kill-switch",
    label: "Kill switch",
    group: "Emergency",
    description:
      "Halt ALL trading now: latch the HALT, revoke the harness order permission, unload the scheduled jobs. Always safe — only closes.",
    danger: true,
    confirm: {
      title: "Engage the kill switch?",
      body: "Immediately halts all trading: latches the trading HALT, revokes the harness order permission, and unloads the scheduled jobs. Always safe — it only closes/stops, never opens. Re-arming is a separate, deliberate step.",
      confirmLabel: "Engage kill switch",
    },
  },
];

/** Display order for the grouped panel. */
export const OPS_GROUP_ORDER: OpsGroup[] = [
  "Preflight",
  "Routines",
  "Backup",
  "Data",
  "Schedule",
  "Emergency",
];

const BY_ID = new Map(OPS_ACTIONS.map((a) => [a.id, a]));

/** Look up an action's metadata by ID. Map lookup → no prototype-chain hits. */
export function findOpsAction(id: string): OpsActionMeta | undefined {
  return BY_ID.get(id);
}

export const OPS_ACTION_IDS: readonly string[] = OPS_ACTIONS.map((a) => a.id);
