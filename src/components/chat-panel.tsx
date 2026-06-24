"use client";

import { useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import {
  CHAT_MODELS,
  CHAT_MODEL_LABEL as MODEL_LABEL,
  type ChatModel,
} from "@/lib/chat";

type Role = "user" | "assistant";
type Message = { id: number; role: Role; text: string };

export function ChatPanel() {
  const [model, setModel] = useState<ChatModel>("claude");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  function appendToLast(text: string) {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === prev.length - 1 ? { ...m, text: m.text + text } : m,
      ),
    );
  }

  async function send() {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    setError(null);
    setInput("");

    const userId = ++idRef.current;
    const assistantId = ++idRef.current;
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: prompt },
      { id: assistantId, role: "assistant", text: "" },
    ]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const line = buffer.slice(0, sep).trim();
          buffer = buffer.slice(sep + 2);
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5).trim()) as {
            type: "chunk" | "done" | "error";
            text?: string;
            message?: string;
          };
          if (evt.type === "chunk" && evt.text) appendToLast(evt.text);
          else if (evt.type === "error") setError(evt.message ?? "Unknown error");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Model selector */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs text-fg-muted">Model</span>
        <div
          role="radiogroup"
          aria-label="Model"
          className="flex gap-1 rounded-pill border border-line p-0.5"
        >
          {CHAT_MODELS.map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={model === m}
              disabled={streaming}
              onClick={() => setModel(m)}
              className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                model === m
                  ? "bg-surface-overlay text-fg"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {MODEL_LABEL[m]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-fg-muted">
          Local CLI · your subscription · no API keys
        </span>
      </div>

      {/* Conversation */}
      <div
        aria-live="polite"
        className="flex min-h-72 flex-1 flex-col gap-4 overflow-y-auto rounded-card border border-line bg-surface-raised p-4"
      >
        {messages.length === 0 ? (
          <p className="m-auto max-w-sm text-pretty text-center text-sm text-fg-muted">
            Ask about the paper account, a position, or the strategy. Grounded
            in this repo and answered by the local {MODEL_LABEL[model]} CLI.
          </p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={m.role === "user" ? "flex justify-end" : "flex"}
            >
              {m.role === "user" ? (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-card bg-surface-overlay px-3.5 py-2.5 text-sm text-fg">
                  {m.text}
                </div>
              ) : (
                <div className="max-w-[85%] rounded-card px-3.5 py-2.5 text-sm text-fg">
                  {m.text ? (
                    <Markdown source={m.text} />
                  ) : streaming ? (
                    <span className="text-fg-muted">Thinking…</span>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-loss">
          {error}
        </p>
      ) : null}

      {/* Composer */}
      <form
        className="mt-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          aria-label="Message"
          placeholder={`Ask ${MODEL_LABEL[model]} about the account…`}
          className="min-h-[2.75rem] flex-1 resize-y rounded-card border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted"
        />
        {streaming ? (
          <Button variant="secondary" onClick={stop} type="button">
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()}>
            Send
          </Button>
        )}
      </form>
    </div>
  );
}
