import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SampleDataBanner } from "@/components/sample-data-badge";
import { anySample } from "./sample-data";

/**
 * Sample-data honesty: a seeded record (`sample: true`) must trigger the
 * "Sample data" indicator on any view that renders it, while live records
 * (marker omitted or false) must not. These pin both halves of that contract —
 * the `anySample` predicate the views gate on, and the banner it drives.
 */
describe("anySample", () => {
  it("is true when any record is sample-flagged", () => {
    expect(anySample([{ sample: false }, { sample: true }])).toBe(true);
    expect(anySample([{ sample: true }])).toBe(true);
  });

  it("is false for live records (marker omitted or false)", () => {
    expect(anySample([{}, { sample: false }])).toBe(false);
    expect(anySample([])).toBe(false);
  });
});

describe("SampleDataBanner", () => {
  it("renders the Sample data indicator when a sample record is present", () => {
    const proposals = [{ sample: false }, { sample: true }];
    const html = renderToStaticMarkup(
      createElement(SampleDataBanner, { show: anySample(proposals) }),
    );
    expect(html).toContain("SAMPLE DATA");
    expect(html).toMatch(/role="status"/);
  });

  it("renders nothing when every record is live", () => {
    const proposals = [{ sample: false }, {}];
    const html = renderToStaticMarkup(
      createElement(SampleDataBanner, { show: anySample(proposals) }),
    );
    expect(html).toBe("");
  });
});
