/**
 * Red-team prosecutor model constants, shared by client + server (no
 * `server-only` here so the submit form, the re-run button, and the verdict card
 * can import it). The server-only spawn logic lives in `lib/server/red-team.ts`,
 * which re-exports these so existing server imports keep working.
 *
 * `codex` = GPT (the default — a different model family from the proposer, the
 * intended cross-model adversarial setup); `claude` = Claude Opus, the opt-in
 * second judge so the desk can A/B the same proposal under both models.
 */

export const RED_TEAM_MODELS = ["codex", "claude"] as const;
export type RedTeamModel = (typeof RED_TEAM_MODELS)[number];

/** GPT (codex) is always the default — Claude is opt-in. */
export const DEFAULT_RED_TEAM_MODEL: RedTeamModel = "codex";

/** Narrow an untrusted value to a {@link RedTeamModel}, falling back to GPT. */
export function parseRedTeamModel(raw: unknown): RedTeamModel {
  return raw === "claude" ? "claude" : DEFAULT_RED_TEAM_MODEL;
}

/** Short label for chips/badges (verdict card header). */
export const RED_TEAM_MODEL_LABEL: Record<RedTeamModel, string> = {
  codex: "GPT",
  claude: "Claude",
};

/** Full label for the toggle options — the model the user is choosing between. */
export const RED_TEAM_MODEL_FULL_LABEL: Record<RedTeamModel, string> = {
  codex: "GPT 5.5",
  claude: "Claude Opus 4.8",
};
