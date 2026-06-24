import { describe, expect, it, vi } from "vitest";
import { pingDeadMan, sendHeartbeat } from "./notify";

function ok(): Response {
  return new Response("ok", { status: 200 });
}

describe("pingDeadMan", () => {
  it("is a no-op when no ping key is configured", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await pingDeadMan("market-open-execution", "success", { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("pings the routine's healthcheck on success", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await pingDeadMan("market-open-execution", "success", {
      fetchImpl,
      pingKey: "KEY",
      baseUrl: "https://hc.test",
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const url = (fetchImpl.mock.calls[0] as unknown as [string])[0];
    expect(String(url)).toBe("https://hc.test/KEY/market-open-execution");
  });

  it("appends /start and /fail for those events", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await pingDeadMan("midday-scan", "start", {
      fetchImpl,
      pingKey: "KEY",
      baseUrl: "https://hc.test",
    });
    await pingDeadMan("midday-scan", "fail", {
      fetchImpl,
      pingKey: "KEY",
      baseUrl: "https://hc.test",
    });
    const calls = fetchImpl.mock.calls as unknown as [string][];
    expect(String(calls[0][0])).toMatch(/\/midday-scan\/start$/);
    expect(String(calls[1][0])).toMatch(/\/midday-scan\/fail$/);
  });

  it("never throws when the ping fails (alerting must not crash a run)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      pingDeadMan("eod", "success", { fetchImpl, pingKey: "KEY" }),
    ).resolves.toBeUndefined();
  });
});

describe("sendHeartbeat", () => {
  it("is a no-op when the provider is off", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await sendHeartbeat("Title", "Body", { provider: "off", fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts to an ntfy topic with a title header", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await sendHeartbeat("Open run", "Placed 2 orders", {
      provider: "ntfy",
      ntfyUrl: "https://ntfy.test",
      ntfyTopic: "desk",
      fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://ntfy.test/desk");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Title).toBe("Open run");
    expect(init.body).toBe("Placed 2 orders");
  });

  it("posts to the Pushover API with token + user", async () => {
    const fetchImpl = vi.fn(async () => ok());
    await sendHeartbeat("Blocked", "1 order blocked", {
      provider: "pushover",
      pushoverToken: "tok",
      pushoverUser: "usr",
      fetchImpl,
    });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.pushover.net/1/messages.json");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      token: "tok",
      user: "usr",
      message: "1 order blocked",
      title: "Blocked",
    });
  });

  it("never throws when the heartbeat fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(
      sendHeartbeat("t", "m", { provider: "ntfy", ntfyTopic: "x", fetchImpl }),
    ).resolves.toBeUndefined();
  });
});
