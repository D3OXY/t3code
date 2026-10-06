import { createContext, memo, use, useMemo, type ComponentProps } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "~/lib/cn";
import { CodeBlock } from "./CodeBlock";
import { createIncrementalMarkdownPlugin } from "./markdownIncremental";
import "./transcript.css";

/** The document being rendered, so code blocks can tell an open streaming fence. */
const MarkdownSourceContext = createContext<{
  readonly source: string;
  readonly streaming: boolean;
}>({
  source: "",
  streaming: false,
});

type HastNode = NonNullable<ExtraProps["node"]>["children"][number];

function hastText(node: HastNode): string {
  if (node.type === "text") return node.value;
  return "children" in node ? node.children.map(hastText).join("") : "";
}

const CLOSING_FENCE = /\n {0,3}(`{3,}|~{3,})[ \t]*$/;

function MarkdownPre({ node, children }: ComponentProps<"pre"> & ExtraProps) {
  const { source, streaming } = use(MarkdownSourceContext);
  const code = node?.children.find(
    (child): child is Extract<HastNode, { type: "element" }> =>
      child.type === "element" && child.tagName === "code",
  );
  if (code === undefined) return <pre>{children}</pre>;
  const className = code.properties.className;
  const language = (Array.isArray(className) ? className : [])
    .map(String)
    .find((name) => name.startsWith("language-"))
    ?.slice("language-".length);
  const text = hastText(code).replace(/\n$/, "");
  // While streaming, a fence with no closing line yet is still being written.
  const start = node?.position?.start.offset;
  const end = node?.position?.end.offset;
  const open =
    streaming &&
    start !== undefined &&
    end !== undefined &&
    /^ {0,3}(`{3,}|~{3,})/.test(source.slice(start, end)) &&
    !CLOSING_FENCE.test(source.slice(start, end));
  return <CodeBlock code={text} language={language ?? null} plain={open} />;
}

const COMPONENTS: Components = {
  pre: MarkdownPre,
  a: ({ node: _node, href, children, ...props }) => (
    <a {...props} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  table: ({ node: _node, children }) => (
    <div className="glass-md-table">
      <table>{children}</table>
    </div>
  ),
  img: ({ node: _node, src, alt }) => (
    <img
      src={typeof src === "string" ? src : undefined}
      alt={alt ?? ""}
      loading="lazy"
      decoding="async"
    />
  ),
};

const PLUGINS = [remarkGfm];
const FENCE = /(?:^|\n) {0,3}(?:`{3}|~{3})/;

/**
 * Agent markdown: GFM, no raw HTML, links in a new tab, Shiki code blocks.
 * While `streaming`, newly inserted blocks fade in once and a document with
 * fences parses incrementally so a long code-heavy answer stays cheap per token.
 */
export const Markdown = memo(function Markdown({
  text,
  streaming = false,
  className,
}: {
  readonly text: string;
  readonly streaming?: boolean;
  readonly className?: string;
}) {
  const incremental = streaming && FENCE.test(text);
  const remarkPlugins = useMemo(
    () => (incremental ? [...PLUGINS, createIncrementalMarkdownPlugin()] : PLUGINS),
    [incremental],
  );
  const context = useMemo(() => ({ source: text, streaming }), [text, streaming]);
  return (
    <div className={cn("glass-md", className)} data-streaming={streaming ? "" : undefined}>
      <MarkdownSourceContext value={context}>
        <ReactMarkdown remarkPlugins={remarkPlugins} skipHtml components={COMPONENTS}>
          {text}
        </ReactMarkdown>
      </MarkdownSourceContext>
    </div>
  );
});
