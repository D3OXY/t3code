import {
  getSharedHighlighter,
  type DiffsHighlighter,
  type SupportedLanguages,
} from "@pierre/diffs";
import { useEffect, useState } from "react";

import { CopyButton } from "./CopyButton";

// Both themes render at once as CSS variables (--shiki-light / --shiki-dark),
// so switching the app theme is a repaint, never a re-highlight.
const THEMES = { light: "pierre-light", dark: "pierre-dark" } as const;

const highlighters = new Map<
  string,
  Promise<{ highlighter: DiffsHighlighter; language: string }>
>();

/**
 * The shared highlighter with `language` loaded. Always the Oniguruma WASM
 * engine (the JS engine can backtrack catastrophically); the shared highlighter
 * is first-caller-wins, so every caller must ask for it. Unknown languages
 * resolve to "text".
 */
function loadHighlighter(
  language: string,
): Promise<{ highlighter: DiffsHighlighter; language: string }> {
  const cached = highlighters.get(language);
  if (cached) return cached;
  const promise = getSharedHighlighter({
    themes: [THEMES.dark, THEMES.light],
    langs: [language as SupportedLanguages],
    preferredHighlighter: "shiki-wasm",
  })
    .then((highlighter) => ({ highlighter, language }))
    .catch((error: unknown) => {
      if (language === "text") {
        highlighters.delete(language);
        throw error;
      }
      return loadHighlighter("text");
    });
  highlighters.set(language, promise);
  return promise;
}

const MAX_CACHE_ENTRIES = 400;
const MAX_CACHE_CHARS = 4_000_000;

/** Least-recently-used cache of highlighted HTML, bounded by entries and size. */
const htmlCache = {
  entries: new Map<string, string>(),
  chars: 0,
  get(key: string): string | undefined {
    const html = this.entries.get(key);
    if (html === undefined) return undefined;
    this.entries.delete(key);
    this.entries.set(key, html);
    return html;
  },
  set(key: string, html: string) {
    const previous = this.entries.get(key);
    if (previous !== undefined) this.chars -= previous.length + key.length;
    this.entries.delete(key);
    this.entries.set(key, html);
    this.chars += html.length + key.length;
    for (const [oldest, value] of this.entries) {
      if (this.entries.size <= MAX_CACHE_ENTRIES && this.chars <= MAX_CACHE_CHARS) break;
      this.entries.delete(oldest);
      this.chars -= value.length + oldest.length;
    }
  },
};

const LANGUAGE_ALIASES: Record<string, string> = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  js: "javascript",
  ts: "typescript",
  py: "python",
  rb: "ruby",
  yml: "yaml",
  md: "markdown",
  plaintext: "text",
  txt: "text",
};

/** The Shiki language id for a fence info string. */
export function normalizeLanguage(language: string | null | undefined): string {
  const id = language?.trim().toLowerCase() ?? "";
  if (id === "") return "text";
  return LANGUAGE_ALIASES[id] ?? id;
}

function highlight(highlighter: DiffsHighlighter, code: string, language: string): string {
  const options = { themes: THEMES, defaultColor: false } as const;
  try {
    return highlighter.codeToHtml(code, { ...options, lang: language });
  } catch {
    return highlighter.codeToHtml(code, { ...options, lang: "text" });
  }
}

/**
 * A fenced code block: language label, copy button, and Shiki highlighting.
 * `plain` renders the raw text (an unfinished streaming fence). Plain and
 * highlighted output share metrics, so the swap never shifts layout.
 */
export function CodeBlock({
  code,
  language,
  plain = false,
}: {
  readonly code: string;
  readonly language: string | null;
  readonly plain?: boolean;
}) {
  const lang = normalizeLanguage(language);
  const key = `${lang}\u0000${code}`;
  // Highlighting lands in state (not only the cache) so the swap re-renders.
  const [highlighted, setHighlighted] = useState<{
    readonly key: string;
    readonly html: string;
  } | null>(null);
  const html = plain ? undefined : highlighted?.key === key ? highlighted.html : htmlCache.get(key);

  useEffect(() => {
    if (plain || htmlCache.get(key) !== undefined) return;
    let cancelled = false;
    loadHighlighter(lang).then(
      ({ highlighter, language: loaded }) => {
        const output = highlight(highlighter, code, loaded);
        htmlCache.set(key, output);
        if (!cancelled) setHighlighted({ key, html: output });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [code, key, lang, plain]);

  return (
    <div className="glass-codeblock group/code">
      <div className="flex h-8 items-center justify-between pr-1 pl-3">
        <span className="font-mono text-[11px] text-faint">{lang === "text" ? "" : lang}</span>
        <div className="opacity-0 transition-opacity duration-150 group-hover/code:opacity-100 focus-within:opacity-100">
          <CopyButton text={code} label="Copy code" />
        </div>
      </div>
      {html === undefined ? (
        <pre className="glass-code-plain">
          <code>{code}</code>
        </pre>
      ) : (
        <div className="glass-code-html" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
