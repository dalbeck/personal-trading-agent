import { describe, expect, it } from "vitest";
import { parseFrontmatter } from "./frontmatter";

/**
 * Narrative `data/` artifacts (decision journal, coaching log, chats) are
 * Markdown with a YAML frontmatter block. The reader must split the two and
 * — critically — keep ISO dates/timestamps as plain strings (YAML would
 * otherwise coerce them to Date objects, breaking the zod contracts).
 */
describe("parseFrontmatter", () => {
  it("splits frontmatter mapping from the markdown body", () => {
    const raw = [
      "---",
      "id: j-1",
      "symbol: MSFT",
      "qty: 9",
      "price: 432.75",
      "tags: [megacap, trend]",
      "---",
      "",
      "**Thesis.** Megacap leadership intact.",
    ].join("\n");

    const { data, body } = parseFrontmatter(raw);

    expect(data).toMatchObject({
      id: "j-1",
      symbol: "MSFT",
      qty: 9,
      price: 432.75,
      tags: ["megacap", "trend"],
    });
    expect(body).toBe("**Thesis.** Megacap leadership intact.");
  });

  it("keeps ISO dates and timestamps as strings (no Date coercion)", () => {
    const raw = [
      "---",
      "timestamp: 2026-06-20T09:41:00-04:00",
      "reviewDate: 2026-07-21",
      "---",
      "body",
    ].join("\n");

    const { data } = parseFrontmatter(raw);

    expect(typeof data.timestamp).toBe("string");
    expect(data.timestamp).toBe("2026-06-20T09:41:00-04:00");
    expect(typeof data.reviewDate).toBe("string");
    expect(data.reviewDate).toBe("2026-07-21");
  });

  it("preserves markdown structure in the body, including --- rules", () => {
    const raw = [
      "---",
      "id: c-1",
      "---",
      "## Expected",
      "AMD to base.",
      "",
      "---",
      "",
      "## Actual",
      "AMD faded.",
    ].join("\n");

    const { body } = parseFrontmatter(raw);
    expect(body).toContain("## Expected");
    expect(body).toContain("## Actual");
    expect(body).toContain("\n---\n");
  });

  it("throws when the frontmatter block is missing", () => {
    expect(() => parseFrontmatter("no frontmatter here")).toThrow(
      /frontmatter/i,
    );
  });

  it("throws when the frontmatter is not a mapping", () => {
    const raw = ["---", "- just", "- a", "- list", "---", "body"].join("\n");
    expect(() => parseFrontmatter(raw)).toThrow(/mapping/i);
  });
});
