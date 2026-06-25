import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

/**
 * Safe markdown renderer for dynamic, LLM/agent-generated content — chat
 * output, decision-journal theses, coaching notes. The input is UNTRUSTED.
 *
 * Pipeline (order matters):
 *   remark-gfm      → tables, task lists, strikethrough, autolinks
 *   rehype-raw      → parse any embedded raw HTML into nodes…
 *   rehype-sanitize → …so this can strip everything dangerous (script/iframe,
 *                     on* handlers, javascript: URLs). Runs on the untrusted
 *                     tree and leaves only the GitHub-safe allowlist.
 *   rehype-highlight→ runs AFTER sanitize, so the hljs spans it injects are
 *                     trusted output and survive. Sanitize preserves the
 *                     `language-*` class it needs (see schema below).
 *
 * Never add `MDX` here — rendering untrusted MDX executes arbitrary JS. MDX is
 * only for trusted, statically-authored docs. See planning/phase-1.5 spec.
 */

// Extend the GitHub schema to keep `className` on <code> (the `language-xxx`
// hint rehype-highlight reads) — everything else stays locked to the default.
const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className"]],
  },
};

const components: Components = {
  h1: (props) => (
    <h1
      className="mt-4 mb-2 text-balance text-xl font-semibold text-fg first:mt-0"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="mt-4 mb-2 text-balance text-lg font-semibold text-fg first:mt-0"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="mt-3 mb-1.5 text-base font-semibold text-fg first:mt-0"
      {...props}
    />
  ),
  h4: (props) => (
    <h4
      className="mt-3 mb-1 text-sm font-semibold text-fg first:mt-0"
      {...props}
    />
  ),
  p: (props) => (
    <p className="my-2 text-pretty leading-relaxed text-fg first:mt-0 last:mb-0" {...props} />
  ),
  a: ({ children, ...props }) => (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className="text-link underline underline-offset-2 transition-colors hover:text-link-hover"
      {...props}
    >
      {children}
    </a>
  ),
  ul: (props) => (
    <ul className="my-2 list-disc space-y-1 pl-5 text-fg first:mt-0 last:mb-0" {...props} />
  ),
  ol: (props) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 text-fg first:mt-0 last:mb-0" {...props} />
  ),
  li: (props) => <li className="leading-relaxed" {...props} />,
  blockquote: (props) => (
    <blockquote
      className="my-2 border-l-2 border-line pl-3 text-fg-muted italic first:mt-0 last:mb-0"
      {...props}
    />
  ),
  hr: () => <hr className="my-4 border-line" />,
  strong: (props) => <strong className="font-semibold text-fg" {...props} />,
  table: (props) => (
    <div className="my-3 overflow-x-auto first:mt-0 last:mb-0">
      <table
        className="w-full border-collapse text-sm tabular-nums"
        {...props}
      />
    </div>
  ),
  thead: (props) => <thead className="border-b border-line" {...props} />,
  th: (props) => (
    <th
      className="border border-line px-3 py-1.5 text-left font-semibold text-fg"
      {...props}
    />
  ),
  td: (props) => (
    <td className="border border-line px-3 py-1.5 text-fg" {...props} />
  ),
  pre: (props) => (
    <pre
      className="my-3 overflow-x-auto rounded-card border border-line bg-surface-overlay p-3 text-sm leading-relaxed first:mt-0 last:mb-0"
      {...props}
    />
  ),
  code: ({ className, children, ...props }) => {
    // Block code carries an hljs/language-* class (added by remark + highlight);
    // inline code has none. Inline gets the pill treatment; block stays bare so
    // the <pre> wrapper owns the surface.
    const isBlock =
      typeof className === "string" &&
      (className.includes("hljs") || className.includes("language-"));
    if (isBlock) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-surface-overlay px-1 py-0.5 text-[0.85em] text-fg"
        {...props}
      >
        {children}
      </code>
    );
  },
};

export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, schema],
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
        ]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
