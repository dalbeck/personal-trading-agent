import type { ReactNode } from "react";

/**
 * Tiny, safe markdown renderer for our own governance docs. Supports headings,
 * paragraphs, unordered/ordered lists, horizontal rules, and inline bold /
 * italic / code. Builds React nodes directly (no raw HTML injection).
 */

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*([^*]+)\*\*|`([^`]+)`|_([^_]+)_)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-surface-overlay px-1 py-0.5 text-[0.85em]"
        >
          {m[3]}
        </code>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(<em key={key++}>{m[4]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={key++} className="text-pretty text-sm leading-relaxed text-fg">
          {renderInline(para.join(" "))}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => (
        <li key={i}>{renderInline(it)}</li>
      ));
      blocks.push(
        list.ordered ? (
          <ol
            key={key++}
            className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-fg"
          >
            {items}
          </ol>
        ) : (
          <ul
            key={key++}
            className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-fg"
          >
            {items}
          </ul>
        ),
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const ulItem = /^[-*]\s+(.*)$/.exec(line);
    const olItem = /^\d+\.\s+(.*)$/.exec(line);

    if (line.trim() === "") {
      flushPara();
      flushList();
    } else if (line.trim() === "---") {
      flushPara();
      flushList();
      blocks.push(<hr key={key++} className="my-4 border-line" />);
    } else if (heading) {
      flushPara();
      flushList();
      const level = heading[1].length;
      const content = renderInline(heading[2]);
      if (level === 1)
        blocks.push(
          <h2 key={key++} className="text-balance text-xl font-semibold text-fg">
            {content}
          </h2>,
        );
      else if (level === 2)
        blocks.push(
          <h3 key={key++} className="mt-2 text-base font-semibold text-fg">
            {content}
          </h3>,
        );
      else
        blocks.push(
          <h4 key={key++} className="mt-2 text-sm font-semibold text-fg">
            {content}
          </h4>,
        );
    } else if (ulItem) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ulItem[1]);
    } else if (olItem) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(olItem[1]);
    } else if (list && list.items.length) {
      // Continuation of a wrapped list item (our docs separate real paragraphs
      // from lists with a blank line, which flushes the list above).
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();

  return <div className="flex flex-col gap-3">{blocks}</div>;
}
