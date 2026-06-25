/**
 * The argv for a headless routine run (`claude -p`). The routine sub-agent needs
 * **permission to use its tools**, or — as a real run showed — it can't act and
 * just asks a clarifying question instead of doing the scan.
 *
 * We grant only the **safe research + write surface**. The project's
 * `.claude/settings.json` deny-list still blocks the Robinhood order tools,
 * `.env`, and `.claude/**` (a deny always wins over an allow), so the routine
 * can research and write **proposals** (review candidates) but can NEVER place an
 * order or read secrets. Writes/edits are scoped to `data/**` so it can't touch
 * source or strategy files; Bash is scoped to `curl` so it can only reach the
 * local endpoints (watchlist/discover, research/finance).
 */
export const ROUTINE_ALLOWED_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "LS",
  "WebSearch",
  "WebFetch",
  "Write(data/**)",
  "Edit(data/**)",
  "Bash(curl:*)",
] as const;

/** Build the `claude -p` argv for a routine prompt. Exported so the allow-list
 *  (and the absence of any order/secret/destructive grant) is unit-tested. */
export function buildRoutineCliArgs(prompt: string): string[] {
  return ["-p", prompt, "--allowedTools", ...ROUTINE_ALLOWED_TOOLS];
}
