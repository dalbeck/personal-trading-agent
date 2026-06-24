import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./markdown";

/**
 * The chat panel, decision journal, and coaching log render markdown produced
 * by LLMs — untrusted input. These tests pin the two things that matter:
 * the output is styled GFM, and any injection payload is provably stripped.
 */
function render(source: string): string {
  return renderToStaticMarkup(createElement(Markdown, { source }));
}

describe("Markdown — GFM rendering", () => {
  it("renders a GFM table with a real <table>", () => {
    const html = render(
      ["| Ticker | Qty |", "| --- | --- |", "| MSFT | 9 |"].join("\n"),
    );
    expect(html).toContain("<table");
    expect(html).toContain("<td");
    expect(html).toContain("MSFT");
  });

  it("renders headings, lists, and blockquotes", () => {
    const html = render(
      ["# Heading", "", "- one", "- two", "", "> a quote"].join("\n"),
    );
    expect(html).toMatch(/<h1[^>]*>Heading<\/h1>/);
    expect(html).toContain("<li");
    expect(html).toContain("<blockquote");
  });

  it("syntax-highlights fenced code blocks", () => {
    const html = render(["```js", "const x = 1;", "```"].join("\n"));
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    // rehype-highlight tags the block and tokens with hljs classes.
    expect(html).toContain("hljs");
  });

  it("renders inline code", () => {
    const html = render("Use the `claude -p` CLI.");
    expect(html).toContain("<code");
    expect(html).toContain("claude -p");
  });
});

describe("Markdown — link safety", () => {
  it("opens external links with rel='noopener noreferrer'", () => {
    const html = render("[Alpaca](https://alpaca.markets)");
    expect(html).toMatch(/<a [^>]*href="https:\/\/alpaca\.markets"/);
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("strips javascript: URLs", () => {
    const html = render("[click me](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });
});

describe("Markdown — sanitization of untrusted payloads", () => {
  it("strips raw <script> tags", () => {
    const html = render("Hello\n\n<script>window.__pwned = 1;</script>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("window.__pwned");
  });

  it("strips event-handler attributes on raw HTML", () => {
    const html = render('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert(1)");
  });

  it("strips raw inline HTML elements like <iframe>", () => {
    const html = render('<iframe src="https://evil.test"></iframe>');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("evil.test");
  });
});
