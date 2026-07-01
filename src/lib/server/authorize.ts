import "server-only";

/**
 * Shared request authorization for LOCAL-ONLY mutating API routes.
 *
 * **Fail closed**: with no `ROUTINE_TRIGGER_TOKEN` configured every gated route
 * refuses (503). When a token is set, a request is authorized if it is either:
 *  - a **CLI caller** presenting `Authorization: Bearer <token>`, or
 *  - a **same-origin browser** request — proven by `Sec-Fetch-Site:
 *    same-origin` (a browser-set, forbidden-to-JS header a cross-origin page
 *    cannot forge) or a same-host `Origin`. The dashboard never embeds the
 *    secret token in the page; the same-origin signal is the browser's
 *    credential.
 *
 * A non-localhost Host is rejected outright (defense in depth atop binding to
 * 127.0.0.1). A cross-site request is rejected even though it lacks the token.
 *
 * This is the single source of truth lifted from the ops control-panel route;
 * every mutating route imports it so the desk's own headless routine agents (and
 * any CSRF / DNS-rebind attempt) cannot reach a money/trade or rail-relaxing
 * endpoint anonymously.
 */
export type AuthResult = { ok: true } | { ok: false; status: number; error: string };

export function authorize(req: Request): AuthResult {
  const host = req.headers.get("host") ?? "";
  const hostname = host.replace(/:\d+$/, "").toLowerCase();
  const isLocalHost =
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]";
  if (!isLocalHost) {
    return { ok: false, status: 403, error: "forbidden: localhost only" };
  }

  const token = process.env.ROUTINE_TRIGGER_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 503,
      error:
        "Disabled: set ROUTINE_TRIGGER_TOKEN in .env and restart the server to enable.",
    };
  }

  // CLI path: explicit bearer token.
  const auth = req.headers.get("authorization");
  if (auth) {
    return auth === `Bearer ${token}`
      ? { ok: true }
      : { ok: false, status: 401, error: "unauthorized" };
  }

  // Browser path: same-origin only.
  const site = req.headers.get("sec-fetch-site");
  if (site) {
    return site === "same-origin"
      ? { ok: true }
      : { ok: false, status: 403, error: "forbidden: cross-origin request" };
  }
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host === host) return { ok: true };
    } catch {
      /* malformed Origin → fall through to refusal */
    }
    return { ok: false, status: 403, error: "forbidden: cross-origin request" };
  }

  // No bearer and no same-origin signal → a non-browser caller without the
  // token. Refuse.
  return { ok: false, status: 401, error: "unauthorized" };
}

/**
 * Convenience wrapper for route handlers: returns a ready-to-return refusal
 * `Response` when the request is not authorized, or `null` when it is. Usage:
 *
 * ```ts
 * const denied = requireAuthorized(req);
 * if (denied) return denied;
 * ```
 */
export function requireAuthorized(req: Request): Response | null {
  const auth = authorize(req);
  return auth.ok ? null : Response.json({ error: auth.error }, { status: auth.status });
}
