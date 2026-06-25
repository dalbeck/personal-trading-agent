import { describe, expect, it } from "vitest";
import {
  ORDER_PLACING_ROUTINES,
  ROUTINE_CATALOG,
  routinePlacesOrders,
} from "./routines";

describe("routine catalog", () => {
  it("only the market-open routine places orders (confirm-gated in the UI)", () => {
    expect(ORDER_PLACING_ROUTINES).toEqual(["market-open-execution"]);
    expect(routinePlacesOrders("market-open-execution")).toBe(true);
  });

  it("the read/write-only routines do not place orders", () => {
    for (const r of ROUTINE_CATALOG) {
      if (r.id === "market-open-execution") continue;
      expect(routinePlacesOrders(r.id)).toBe(false);
    }
  });
});
