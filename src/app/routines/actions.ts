"use server";

import { ROUTINE_CATALOG, type RoutineId } from "@/lib/routines";

const ROUTINE_IDS = new Set<string>(ROUTINE_CATALOG.map((r) => r.id));

/**
 * Trigger a routine from the dashboard's "Run now" button. This is a thin,
 * localhost-only trigger: it POSTs to the existing **token-gated** routine
 * endpoint (`/api/routines/<id>`) with the `ROUTINE_TRIGGER_TOKEN` injected
 * **server-side** — the token is never exposed to the browser, and the actual
 * execution stays behind the same gate `scripts/run-routine.sh` and launchd use.
 *
 * Allowlisted: the id is validated against the fixed routine catalog (no
 * client-supplied path). Fire-and-forget: a routine spawns `claude -p` and can
 * run for minutes, so we don't await — the always-on local server runs it to
 * completion and writes the `RunLog`; the UI shows the result on Routines/Logs
 * once it finishes. Order-placing routines are confirm-gated in the UI before
 * this is called. Nothing here can open the live gate or move real money.
 */
export async function triggerRoutine(
  id: string,
): Promise<{ started: boolean; error?: string }> {
  if (!ROUTINE_IDS.has(id)) {
    return { started: false, error: "unknown routine" };
  }

  const port = process.env.PORT ?? "3000";
  const token = process.env.ROUTINE_TRIGGER_TOKEN;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  // Fire-and-forget — see the doc comment above.
  void fetch(`http://127.0.0.1:${port}/api/routines/${id as RoutineId}`, {
    method: "POST",
    headers,
  }).catch(() => {
    /* the run records its own RunLog; a transport hiccup here is non-fatal */
  });

  return { started: true };
}
