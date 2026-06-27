import { describe, expect, it } from "vitest";
import { catalystSourceDate, catalystSourceLine } from "@/lib/catalyst-source";
import type { CatalystSource } from "@/lib/types";

const SRC: CatalystSource = {
  headline: "Eli Lilly wins CHMP recommendation for EU approval",
  publisher: "Benzinga",
  url: "https://example.com/lly",
  publishedAt: "2026-06-26T13:30:00Z",
};

describe("catalystSourceDate", () => {
  it("formats a valid timestamp to YYYY-MM-DD", () => {
    expect(catalystSourceDate(SRC)).toBe("2026-06-26");
  });

  it("returns null for a missing / unparseable timestamp", () => {
    expect(catalystSourceDate({ ...SRC, publishedAt: null })).toBeNull();
    expect(catalystSourceDate({ ...SRC, publishedAt: "not a date" })).toBeNull();
  });
});

describe("catalystSourceLine", () => {
  it("renders headline — publisher · date", () => {
    expect(catalystSourceLine(SRC)).toBe(
      '"Eli Lilly wins CHMP recommendation for EU approval" — Benzinga · 2026-06-26',
    );
  });

  it("omits the date when absent and the publisher when blank", () => {
    expect(catalystSourceLine({ ...SRC, publishedAt: null })).toBe(
      '"Eli Lilly wins CHMP recommendation for EU approval" — Benzinga',
    );
    expect(
      catalystSourceLine({ ...SRC, publisher: "", publishedAt: null }),
    ).toBe('"Eli Lilly wins CHMP recommendation for EU approval"');
  });
});
