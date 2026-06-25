"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { isValidSymbol, normalizeSymbol } from "@/lib/symbol";

/**
 * Editor for the manual watchlist — the editable half of the tracked universe.
 * Add/remove symbols; each change persists via `/api/watchlist` and refreshes
 * the server view so the scout/research universe and the News filter pick it up.
 * Symbols are normalized + validated client-side for snappy feedback and again
 * server-side (the API is the source of truth).
 */
export function WatchlistEditor({ symbols }: { symbols: string[] }) {
  const router = useRouter();
  const [items, setItems] = useState<string[]>(symbols);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(action: "add" | "remove", symbol: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, symbol }),
      });
      const data = (await res.json()) as { symbols?: string[]; error?: string };
      if (res.ok && data.symbols) {
        setItems(data.symbols);
        router.refresh();
      } else {
        setError(data.error ?? "Could not update the watchlist.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const symbol = normalizeSymbol(input);
    if (!isValidSymbol(symbol)) {
      setError("Enter a valid ticker (e.g. NVDA).");
      return;
    }
    setInput("");
    void mutate("add", symbol);
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2" aria-label="Watchlist symbols">
        {items.length === 0 ? (
          <li className="text-sm text-fg-muted">
            No watchlist symbols yet — add one to track it alongside holdings.
          </li>
        ) : (
          items.map((s) => (
            <li
              key={s}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface-overlay px-2.5 py-1 text-xs font-medium text-fg"
            >
              {s}
              <button
                type="button"
                onClick={() => void mutate("remove", s)}
                disabled={busy}
                aria-label={`Remove ${s} from watchlist`}
                className="grid size-4 place-items-center rounded-pill text-fg-muted transition-colors hover:text-loss disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))
        )}
      </ul>

      <form onSubmit={add} className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add ticker…"
          aria-label="Add a ticker to the watchlist"
          maxLength={12}
          className="w-32 rounded-pill border border-line bg-surface px-3 py-1 text-sm uppercase text-fg placeholder:normal-case placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>
          Add
        </Button>
      </form>

      {error ? <p className="text-xs text-loss">{error}</p> : null}
    </div>
  );
}
