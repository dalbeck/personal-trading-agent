import { describe, expect, it } from "vitest";
import { GLOSSARY, tokenizeGlossary, type GlossaryKey } from "./glossary";

/** Pull the matched terms (in order) out of a tokenization. */
function terms(segments: ReturnType<typeof tokenizeGlossary>): GlossaryKey[] {
  return segments.flatMap((s) => (typeof s === "string" ? [] : [s.term]));
}

describe("tokenizeGlossary", () => {
  it("wraps a known phrase as a glossary term, preserving surrounding text", () => {
    const seg = tokenizeGlossary("A reward-to-risk of 2:1 is the floor.");
    expect(terms(seg)).toContain("rr");
    // The literal matched text is preserved so the display reads naturally.
    const match = seg.find((s) => typeof s !== "string");
    expect(match && typeof match !== "string" ? match.text : "").toMatch(
      /reward-to-risk/i,
    );
    // Reassembling the segments reproduces the original text.
    expect(
      seg.map((s) => (typeof s === "string" ? s : s.text)).join(""),
    ).toBe("A reward-to-risk of 2:1 is the floor.");
  });

  it("wraps each term only once across a shared `seen` set (primary appearance)", () => {
    const seen = new Set<GlossaryKey>();
    const first = tokenizeGlossary("relative volume confirms it", seen);
    const second = tokenizeGlossary("relative volume again", seen);
    expect(terms(first)).toContain("relative-volume");
    expect(terms(second)).not.toContain("relative-volume"); // already seen
  });

  it("maps a rule-text variant to the right glossary key", () => {
    expect(terms(tokenizeGlossary("hunt the value trap"))).toContain(
      "value-trap",
    );
  });

  it("leaves text with no known jargon untouched (a single plain segment)", () => {
    const seg = tokenizeGlossary("the thesis must be sound");
    expect(seg).toEqual(["the thesis must be sound"]);
  });

  it("only maps to keys that exist in the glossary", () => {
    const seen = new Set<GlossaryKey>();
    const all = [
      "reward-to-risk value trap relative volume mean-reversion measured move target weight review trigger expense ratio",
    ].flatMap((t) => terms(tokenizeGlossary(t, seen)));
    for (const key of all) expect(GLOSSARY[key]).toBeDefined();
  });
});
