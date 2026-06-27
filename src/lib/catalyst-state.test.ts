import { describe, expect, it } from "vitest";
import {
  CATALYST_NONE_DETAIL,
  CATALYST_NONE_PROSE,
  CATALYST_UNAVAILABLE_DETAIL,
  CATALYST_UNAVAILABLE_PROSE,
  catalystStateDetail,
  catalystStateProse,
  isCatalystUnavailable,
  resolveCatalystState,
} from "@/lib/catalyst-state";

describe("resolveCatalystState", () => {
  it("uses the stored state when present (the three states are distinct)", () => {
    expect(resolveCatalystState({ catalyst: "CHMP approval", catalystState: "found" })).toBe("found");
    expect(resolveCatalystState({ catalyst: null, catalystState: "none" })).toBe("none");
    expect(resolveCatalystState({ catalyst: null, catalystState: "unavailable" })).toBe("unavailable");
  });

  it("derives from catalyst presence for older records (null state), never fabricating 'unavailable'", () => {
    expect(resolveCatalystState({ catalyst: "Q3 beat", catalystState: null })).toBe("found");
    expect(resolveCatalystState({ catalyst: null, catalystState: null })).toBe("none");
    expect(resolveCatalystState({ catalyst: null })).toBe("none");
  });

  it("a stored state overrides the catalyst-presence heuristic", () => {
    // A failed fetch with no catalyst must read 'unavailable', NOT 'none'.
    expect(resolveCatalystState({ catalyst: null, catalystState: "unavailable" })).toBe(
      "unavailable",
    );
  });
});

describe("isCatalystUnavailable", () => {
  it("is true only for the unavailable (fetch-failed) state", () => {
    expect(isCatalystUnavailable("unavailable")).toBe(true);
    expect(isCatalystUnavailable("none")).toBe(false);
    expect(isCatalystUnavailable("found")).toBe(false);
    expect(isCatalystUnavailable(null)).toBe(false);
  });
});

describe("catalystStateDetail / catalystStateProse", () => {
  it("renders a distinct short detail for none vs unavailable, null for found", () => {
    expect(catalystStateDetail("none")).toBe(CATALYST_NONE_DETAIL);
    expect(catalystStateDetail("unavailable")).toBe(CATALYST_UNAVAILABLE_DETAIL);
    expect(catalystStateDetail("found")).toBeNull();
    // The two flagged states never share text.
    expect(CATALYST_NONE_DETAIL).not.toBe(CATALYST_UNAVAILABLE_DETAIL);
  });

  it("renders distinct prose for none vs unavailable; unavailable mentions retry, never 'no catalyst'", () => {
    expect(catalystStateProse("none")).toBe(CATALYST_NONE_PROSE);
    expect(catalystStateProse("unavailable")).toBe(CATALYST_UNAVAILABLE_PROSE);
    expect(catalystStateProse("found")).toBeNull();
    expect(CATALYST_UNAVAILABLE_PROSE).toMatch(/retry/i);
    expect(CATALYST_UNAVAILABLE_PROSE).not.toMatch(/no catalyst/i);
  });
});
