import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorize, requireAuthorized } from "./authorize";

const TOKEN = "test-trigger-token";

/** A request with a localhost Host by default. */
function req(headers: Record<string, string> = {}): Request {
  return new Request("http://127.0.0.1:3000/api/anything", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", ...headers },
  });
}

beforeEach(() => {
  process.env.ROUTINE_TRIGGER_TOKEN = TOKEN;
});

afterEach(() => {
  delete process.env.ROUTINE_TRIGGER_TOKEN;
});

describe("authorize", () => {
  it("fails closed (503) when ROUTINE_TRIGGER_TOKEN is unset", () => {
    delete process.env.ROUTINE_TRIGGER_TOKEN;
    const res = authorize(req({ "sec-fetch-site": "same-origin" }));
    expect(res).toEqual({ ok: false, status: 503, error: expect.any(String) });
  });

  it("authorizes a CLI caller with the correct bearer token", () => {
    expect(authorize(req({ authorization: `Bearer ${TOKEN}` }))).toEqual({
      ok: true,
    });
  });

  it("rejects a wrong bearer token (401)", () => {
    const res = authorize(req({ authorization: "Bearer nope" }));
    expect(res).toEqual({ ok: false, status: 401, error: expect.any(String) });
  });

  it("authorizes a same-origin browser request via Sec-Fetch-Site", () => {
    expect(authorize(req({ "sec-fetch-site": "same-origin" }))).toEqual({
      ok: true,
    });
  });

  it("rejects a cross-site browser request (403)", () => {
    const res = authorize(req({ "sec-fetch-site": "cross-site" }));
    expect(res).toEqual({ ok: false, status: 403, error: expect.any(String) });
  });

  it("authorizes a same-host Origin", () => {
    expect(
      authorize(req({ origin: "http://127.0.0.1:3000" })),
    ).toEqual({ ok: true });
  });

  it("rejects a cross-origin request (403)", () => {
    const res = authorize(req({ origin: "http://evil.localhost:9999" }));
    expect(res).toEqual({ ok: false, status: 403, error: expect.any(String) });
  });

  it("rejects a non-browser caller with no token (401)", () => {
    const res = authorize(req());
    expect(res).toEqual({ ok: false, status: 401, error: expect.any(String) });
  });

  it("rejects a non-localhost Host (403), even with a valid token", () => {
    const res = authorize(
      req({ host: "example.com", authorization: `Bearer ${TOKEN}` }),
    );
    expect(res).toEqual({ ok: false, status: 403, error: expect.any(String) });
  });
});

describe("requireAuthorized", () => {
  it("returns null when the request is authorized", () => {
    expect(requireAuthorized(req({ authorization: `Bearer ${TOKEN}` }))).toBeNull();
  });

  it("returns a Response carrying the refusal status when unauthorized", async () => {
    const denied = requireAuthorized(req({ "sec-fetch-site": "cross-site" }));
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);
    const body = (await denied!.json()) as { error: string };
    expect(typeof body.error).toBe("string");
  });

  it("returns a 503 Response when the token is unset (fail closed)", () => {
    delete process.env.ROUTINE_TRIGGER_TOKEN;
    const denied = requireAuthorized(req({ "sec-fetch-site": "same-origin" }));
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(503);
  });
});
