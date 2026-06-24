import "server-only";

/**
 * Reliability alerts (Phase 2 M6). Two channels, both **fail-soft** — a failed
 * alert must never crash a routine:
 *  - Dead-man switch (healthchecks.io): each routine pings start/success/fail.
 *    A missed/stalled run trips healthchecks.io, which alerts on its own
 *    out-of-band channel.
 *  - Phone heartbeat (ntfy / Pushover): on routine start/finish and on any
 *    blocked order.
 *
 * Both default OFF (no env config → no-op) so dev never reaches the network.
 * Config is injectable for tests.
 */

const TIMEOUT_MS = 5000;

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

export type DeadManEvent = "start" | "success" | "fail";

export interface DeadManOpts {
  pingKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export async function pingDeadMan(
  routine: string,
  event: DeadManEvent,
  opts?: DeadManOpts,
): Promise<void> {
  const pingKey = opts?.pingKey ?? process.env.HEALTHCHECKS_PING_KEY ?? "";
  if (!pingKey) return; // off
  const base =
    opts?.baseUrl ??
    process.env.HEALTHCHECKS_BASE_URL ??
    "https://hc-ping.com";
  const suffix = event === "success" ? "" : `/${event}`;
  const url = `${base}/${pingKey}/${routine}${suffix}`;
  const doFetch = opts?.fetchImpl ?? fetch;
  try {
    await doFetch(url, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Alerting is best-effort — swallow so a routine never dies on it.
  }
}

export type NotifyProvider = "off" | "ntfy" | "pushover";

export interface HeartbeatOpts {
  provider?: NotifyProvider;
  priority?: number;
  ntfyUrl?: string;
  ntfyTopic?: string;
  pushoverToken?: string;
  pushoverUser?: string;
  fetchImpl?: typeof fetch;
}

export async function sendHeartbeat(
  title: string,
  message: string,
  opts?: HeartbeatOpts,
): Promise<void> {
  const provider =
    opts?.provider ??
    (process.env.NOTIFY_PROVIDER as NotifyProvider | undefined) ??
    "off";
  if (provider === "off") return;

  const doFetch = opts?.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(TIMEOUT_MS);

  try {
    if (provider === "ntfy") {
      const baseUrl = opts?.ntfyUrl ?? process.env.NTFY_URL ?? "https://ntfy.sh";
      const topic = opts?.ntfyTopic ?? process.env.NTFY_TOPIC ?? "";
      if (!topic) return;
      await doFetch(`${baseUrl}/${topic}`, {
        method: "POST",
        headers: {
          Title: title,
          Priority: String(clamp(opts?.priority ?? 3, 1, 5)),
        },
        body: message,
        signal,
      });
      return;
    }

    if (provider === "pushover") {
      const token = opts?.pushoverToken ?? process.env.PUSHOVER_TOKEN ?? "";
      const user = opts?.pushoverUser ?? process.env.PUSHOVER_USER ?? "";
      if (!token || !user) return;
      await doFetch("https://api.pushover.net/1/messages.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          user,
          title,
          message,
          priority: clamp(opts?.priority ?? 0, -2, 2),
        }),
        signal,
      });
    }
  } catch {
    // Best-effort — never throw into a routine.
  }
}
