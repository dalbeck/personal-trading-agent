import { describe, expect, it, vi } from "vitest";
import type { ProposedOrder } from "@/lib/risk";
import { placePaperOrder } from "./alpaca";

const order: ProposedOrder = {
  symbol: "NVDA",
  action: "buy",
  side: "long",
  qty: 9,
  limitPrice: 150,
  orderType: "marketable_limit",
  stopPrice: 140,
  assetClass: "equity",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("placePaperOrder", () => {
  it("posts a limit order to /v2/orders and returns the broker id", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ id: "ord-abc", status: "accepted" }),
    );
    const res = await placePaperOrder(order, { fetchImpl });

    expect(res.brokerOrderId).toBe("ord-abc");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(/\/v2\/orders$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      symbol: "NVDA",
      side: "buy",
      type: "limit",
      time_in_force: "day",
      limit_price: 150,
    });
  });

  it("attaches a protective stop as a bracket order", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "x", status: "ok" }));
    await placePaperOrder(order, { fetchImpl });
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.order_class).toBe("bracket");
    expect(body.stop_loss).toMatchObject({ stop_price: 140 });
  });

  it("throws on a non-ok broker response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "no" }, 422));
    await expect(placePaperOrder(order, { fetchImpl })).rejects.toThrow();
  });

  it("maps a sell to the alpaca sell side", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: "s", status: "ok" }));
    await placePaperOrder(
      { ...order, action: "sell", stopPrice: null },
      { fetchImpl },
    );
    const body = JSON.parse(
      (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1]
        .body as string,
    );
    expect(body.side).toBe("sell");
    expect(body.order_class).toBeUndefined();
  });
});
