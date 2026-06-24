import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the child process so the authorized happy path never runs a real script.
const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

import { POST } from "./route";

const TOKEN = "test-trigger-token";

/** A request to the ops endpoint; localhost Host by default. */
function req(headers: Record<string, string> = {}): Request {
  return new Request("http://127.0.0.1:3000/api/ops/x", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", ...headers },
  });
}

function ctx(action: string): { params: Promise<{ action: string }> } {
  return { params: Promise.resolve({ action }) };
}

/** A fake child that streams a line and exits 0 on the next tick. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  queueMicrotask(() => {
    child.stdout.emit("data", Buffer.from("ok\n"));
    child.emit("close", 0);
  });
  return child;
}

beforeEach(() => {
  spawnMock.mockReset();
  spawnMock.mockImplementation(() => fakeChild());
  process.env.ROUTINE_TRIGGER_TOKEN = TOKEN;
});

afterEach(() => {
  delete process.env.ROUTINE_TRIGGER_TOKEN;
});

describe("POST /api/ops/[action] — allowlist refusal", () => {
  it("refuses a NON-allowlisted action ID (404), even with valid auth", async () => {
    const res = await POST(
      req({ "sec-fetch-site": "same-origin", authorization: `Bearer ${TOKEN}` }),
      ctx("rm-rf"),
    );
    expect(res.status).toBe(404);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("refuses a path / traversal injection passed as the action ID (404)", async () => {
    for (const bad of [
      "scripts/preflight.sh",
      "../preflight",
      "/etc/passwd",
      "routine:../../../etc/passwd",
      "preflight; rm -rf /",
    ]) {
      const res = await POST(
        req({ "sec-fetch-site": "same-origin", authorization: `Bearer ${TOKEN}` }),
        ctx(bad),
      );
      expect(res.status, bad).toBe(404);
    }
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("never reads the request body for command data (extra fields ignored)", async () => {
    // A crafted body trying to smuggle a script/path/args must have no effect:
    // an unknown action is still 404 regardless of the body.
    const malicious = new Request("http://127.0.0.1:3000/api/ops/x", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
      },
      body: JSON.stringify({ script: "/bin/sh", path: "../../etc/passwd", args: ["-c", "id"] }),
    });
    const res = await POST(malicious, ctx("definitely-not-an-action"));
    expect(res.status).toBe(404);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ops/[action] — auth gate (fail closed)", () => {
  it("fails closed (503) when ROUTINE_TRIGGER_TOKEN is unset", async () => {
    delete process.env.ROUTINE_TRIGGER_TOKEN;
    const res = await POST(req({ "sec-fetch-site": "same-origin" }), ctx("preflight"));
    expect(res.status).toBe(503);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects a wrong bearer token (401)", async () => {
    const res = await POST(req({ authorization: "Bearer nope" }), ctx("preflight"));
    expect(res.status).toBe(401);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects a cross-site browser request (403)", async () => {
    const res = await POST(req({ "sec-fetch-site": "cross-site" }), ctx("preflight"));
    expect(res.status).toBe(403);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin request (403)", async () => {
    const res = await POST(
      req({ origin: "http://evil.localhost:9999" }),
      ctx("preflight"),
    );
    expect(res.status).toBe(403);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects a non-browser caller with no token (401)", async () => {
    const res = await POST(req(), ctx("preflight"));
    expect(res.status).toBe(401);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("rejects a non-localhost Host (403)", async () => {
    const res = await POST(
      req({ host: "example.com", authorization: `Bearer ${TOKEN}` }),
      ctx("preflight"),
    );
    expect(res.status).toBe(403);
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/ops/[action] — authorized run", () => {
  it("streams and spawns the FIXED command shell-free for a same-origin request", async () => {
    const res = await POST(req({ "sec-fetch-site": "same-origin" }), ctx("preflight"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const text = await res.text();
    expect(text).toContain('"type":"start"');
    expect(text).toContain('"type":"exit"');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [command, args, opts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { shell?: boolean },
    ];
    expect(command).toBe("/bin/bash");
    expect(args).toHaveLength(1);
    expect(args[0]).toMatch(/\/scripts\/preflight\.sh$/);
    expect(opts.shell).toBe(false);
  });

  it("authorizes a CLI caller with the correct bearer token", async () => {
    const res = await POST(
      req({ authorization: `Bearer ${TOKEN}` }),
      ctx("preflight"),
    );
    expect(res.status).toBe(200);
    await res.text();
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });
});
