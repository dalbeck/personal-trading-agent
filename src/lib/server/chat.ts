import "server-only";

import type { ChatModel } from "@/lib/chat";
import { formatCurrency } from "@/lib/format";
import { getPaperAccount } from "@/lib/server/account";
import { readJournal } from "@/lib/server/data";

/**
 * Chat backend helpers. The dashboard spawns the host's `claude` / `codex`
 * CLIs (Max / Codex Pro subscriptions) as subprocesses — no metered API keys.
 * We ground each prompt with a short repo-context preamble so answers are about
 * this account, and tell the model where the source files live.
 * (Model constants live in `@/lib/chat` so the client can share them.)
 */

/** Maps a model to its non-interactive CLI invocation (argv, never a shell). */
export function assistantCommand(
  model: ChatModel,
  prompt: string,
): { cmd: string; args: string[] } {
  switch (model) {
    case "claude":
      return { cmd: "claude", args: ["-p", prompt] };
    case "codex":
      return { cmd: "codex", args: ["exec", prompt] };
  }
}

/** A concise, repo-grounded preamble prepended to the user's question. */
export async function buildGroundingContext(): Promise<string> {
  const [account, journal] = await Promise.all([
    getPaperAccount().catch(() => null),
    readJournal().catch(() => []),
  ]);
  const snap = account?.snapshot ?? null;
  const sourceLabel = account?.source === "alpaca" ? "live Alpaca" : "sample";

  const lines: string[] = [
    "You are the assistant inside a LOCAL paper-trading research dashboard.",
    `Repo: ${process.cwd()}`,
    "This is a PAPER, read-only research tool. Never recommend placing real-money orders; real trading is gated behind a separate two-gate human approval.",
  ];

  if (snap) {
    lines.push(
      `Paper account (${sourceLabel} data): equity ${formatCurrency(
        snap.equity,
      )}, day P&L ${formatCurrency(snap.dayPl, { signed: true })}, ${
        snap.positions.length
      } open positions. Snapshots also in data/snapshots/.`,
    );
  }
  if (journal.length > 0) {
    const latest = journal[0];
    lines.push(
      `Decision journal: ${journal.length} entries in data/decision-journal/ (latest: ${latest.symbol} ${latest.kind}).`,
    );
  }
  lines.push("Strategy lives in strategy/charter.md and strategy/playbook.md.");
  lines.push("Answer the user's question concisely and specifically.");

  return lines.join("\n");
}
