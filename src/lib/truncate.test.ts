import { describe, expect, it } from "vitest";
import { truncateOnWord } from "@/lib/truncate";

describe("truncateOnWord", () => {
  it("returns short text unchanged (no ellipsis)", () => {
    expect(truncateOnWord("Q2 earnings beat", 40)).toBe("Q2 earnings beat");
  });

  it("truncates on a WORD boundary, never mid-word, with an ellipsis", () => {
    const text =
      "Jack Henry provides technology to banks and credit unions. The company operates in Technology (Information Technology Services)";
    const out = truncateOnWord(text, 60);
    expect(out.length).toBeLessThanOrEqual(61); // ≤ max + the ellipsis char
    expect(out.endsWith("…")).toBe(true);
    // The visible body must end on a whole word — never a cut like "Information Te".
    const body = out.slice(0, -1).trimEnd();
    expect(text.startsWith(body)).toBe(true);
    expect(/\s\S{1,2}$/.test(body)).toBe(false); // not a dangling 1–2 char fragment
    expect(body.endsWith("Information")).toBe(false); // doesn't slice into the word
  });

  it("hard-cuts a single over-long word (no space to break on)", () => {
    const out = truncateOnWord("Supercalifragilisticexpialidocious", 10);
    expect(out).toBe("Supercalif…");
  });

  it("trims trailing whitespace/punctuation before the ellipsis", () => {
    const out = truncateOnWord("alpha beta gamma delta", 12);
    expect(out).toBe("alpha beta…");
  });

  it("handles empty / nullish input", () => {
    expect(truncateOnWord("", 10)).toBe("");
    expect(truncateOnWord("   ", 10)).toBe("");
  });
});
