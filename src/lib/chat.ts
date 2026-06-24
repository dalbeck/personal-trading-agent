/**
 * Chat model constants shared by client and server (no `server-only` here so
 * the client chat panel can import it). Server-only spawning/context logic
 * lives in `lib/server/chat.ts`.
 */

export const CHAT_MODELS = ["claude", "codex"] as const;
export type ChatModel = (typeof CHAT_MODELS)[number];

export function isChatModel(value: string): value is ChatModel {
  return (CHAT_MODELS as readonly string[]).includes(value);
}

export const CHAT_MODEL_LABEL: Record<ChatModel, string> = {
  claude: "Claude",
  codex: "Codex",
};
