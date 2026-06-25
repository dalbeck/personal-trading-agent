"use server";

/**
 * Trigger one news-scout scan from the dashboard (a "Run scout" button). Thin,
 * localhost-only: it POSTs to the existing **token-gated** `/api/news-scout/poll`
 * with `ROUTINE_TRIGGER_TOKEN` injected **server-side** (never exposed to the
 * browser). The scout reads public RSS and tags headlines material to the
 * tracked universe (holdings + watchlist) — read-only w.r.t. trading.
 *
 * Awaited (a scan is quick — RSS fetch + match), so the UI can report what it
 * found and refresh.
 */
export async function triggerNewsScout(): Promise<{
  ok: boolean;
  added?: number;
  book?: number;
  error?: string;
}> {
  const port = process.env.PORT ?? "3000";
  const token = process.env.ROUTINE_TRIGGER_TOKEN;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/news-scout/poll`, {
      method: "POST",
      headers,
      body: "{}",
    });
    if (!res.ok) return { ok: false, error: `scout returned ${res.status}` };
    const data = (await res.json()) as { added?: number; book?: number };
    return { ok: true, added: data.added ?? 0, book: data.book ?? 0 };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
