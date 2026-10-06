// Mirrors apps/web/src/markdown-incremental.ts. Glass does not depend on
// mdast/unified types directly, so the few node fields used here are declared
// structurally.

interface Point {
  line: number;
  column: number;
  offset?: number | undefined;
}

interface MdNode {
  type: string;
  position?: { start: Point; end: Point } | undefined;
  children?: MdNode[];
}

type Parser = (source: string, file: never) => unknown;

interface ParsedPrefix {
  source: string;
  offset: number;
  line: number;
  children: MdNode[];
}

/** One cache per streaming renderer. Extra syntax plugins must use the normal
 * parser because their document-wide dependencies are not known here.
 */
export function createIncrementalMarkdownPlugin() {
  let parser: Parser | undefined;
  return function (this: { parser?: Parser | undefined }) {
    const original = this.parser;
    if (!original) return;
    parser ??= createIncrementalMarkdownParser((source, file) => original(source, file) as MdNode);
    const parseDocument = parser;
    // ReactMarkdown creates a processor per render. Its first parse is the
    // document; transforms can then parse synthetic recovery text on that same
    // processor. Those parses must not read or replace the document's cache.
    let documentParsed = false;
    this.parser = (source, file) => {
      if (documentParsed) return original(source, file);
      documentParsed = true;
      return parseDocument(source, file);
    };
  };
}

/** Keep the full document pipeline while avoiding parsing a completed code-heavy
 * prefix on every token. A closed top-level fence followed by a blank line is a
 * parsing boundary. Definitions are document-wide, so they require a full parse.
 */
function createIncrementalMarkdownParser(parse: (source: string, file: never) => MdNode): Parser {
  let cached: ParsedPrefix | undefined;

  return (source, file) => {
    // A streaming CR can become half of a CRLF. A BOM at the suffix boundary
    // would be stripped by a new parser although it is inside the full document.
    if (source.includes("\r") || source.includes("﻿")) return parse(source, file);

    const prefix = cached && source.startsWith(cached.source) ? cached : undefined;
    let root: MdNode;
    if (prefix) {
      root = parse(source.slice(prefix.offset), file);
      if (hasDefinitions(root)) return parse(source, file);
      shiftPositions(root, prefix.offset, prefix.line - 1);
      if (root.position) root.position.start = { line: 1, column: 1, offset: 0 };
      // Remark transforms mutate their input. The cache owns pristine nodes and
      // each render receives its own copy, including source positions.
      (root.children ??= []).unshift(...structuredClone(prefix.children));
    } else {
      root = parse(source, file);
      if (hasDefinitions(root)) return root;
    }

    const children = root.children ?? [];
    for (let index = children.length - 1; index >= 0; index--) {
      const node = children[index];
      if (node?.type !== "code") continue;
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (start === undefined || end === undefined) continue;
      if (prefix && end < prefix.offset) break;
      const value = source.slice(start, end);
      const opening = /^ {0,3}(`{3,}|~{3,})[^\n]*\n/.exec(value)?.[1];
      if (!opening) continue;
      const lastLine = value.slice(value.lastIndexOf("\n") + 1);
      const closing = new RegExp(`^ {0,3}${opening[0]}{${opening.length},}[ \\t]*$`);
      const separator = /^\n[ \t]*\n/.exec(source.slice(end))?.[0];
      if (!closing.test(lastLine) || !separator) continue;
      const offset = end + separator.length;
      cached = {
        source: source.slice(0, offset),
        offset,
        line: node.position!.end.line + 2,
        children: structuredClone(children.slice(0, index + 1)),
      };
      break;
    }
    return root;
  };
}

function hasDefinitions(node: MdNode): boolean {
  return (
    node.type === "definition" ||
    node.type === "footnoteDefinition" ||
    (node.children?.some((child) => hasDefinitions(child)) ?? false)
  );
}

function shiftPositions(node: MdNode, offset: number, lines: number): void {
  if (node.position) {
    for (const point of [node.position.start, node.position.end]) {
      if (point.offset !== undefined) point.offset += offset;
      point.line += lines;
    }
  }
  for (const child of node.children ?? []) shiftPositions(child, offset, lines);
}
