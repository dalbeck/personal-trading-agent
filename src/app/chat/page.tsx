import { ChatPanel } from "@/components/chat-panel";
import { PageTitle } from "@/components/page-shell";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col">
      <PageTitle
        title="Chat"
        subtitle="Grounded Q&A via the local Claude / Codex CLIs — uses your subscription, no API keys."
      />
      <div className="min-h-0 flex-1">
        <ChatPanel />
      </div>
    </div>
  );
}
