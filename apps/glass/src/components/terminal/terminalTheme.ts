import type { ITheme } from "@xterm/xterm";

// Muted ANSI palettes that sit on the monochrome glass tokens; bright variants
// lift toward the foreground instead of saturating.
const DARK_ANSI = {
  black: "#2a2a2e",
  red: "#f07178",
  green: "#8bd49c",
  yellow: "#e6c07b",
  blue: "#82aaff",
  magenta: "#c792ea",
  cyan: "#7fdbca",
  white: "#d4d4d8",
  brightBlack: "#6b6b72",
  brightRed: "#ff8b92",
  brightGreen: "#a6e3b4",
  brightYellow: "#f2d39a",
  brightBlue: "#a4c2ff",
  brightMagenta: "#dbb3f5",
  brightCyan: "#a3eadc",
  brightWhite: "#f4f4f5",
} as const;

const LIGHT_ANSI = {
  black: "#1c1c1e",
  red: "#c4373f",
  green: "#2f8a4c",
  yellow: "#9a6a00",
  blue: "#2f5fc7",
  magenta: "#8a3fb8",
  cyan: "#1f7f86",
  white: "#6b6b70",
  brightBlack: "#8a8a90",
  brightRed: "#dc4c54",
  brightGreen: "#3aa15c",
  brightYellow: "#b47f10",
  brightBlue: "#4677dc",
  brightMagenta: "#a157cf",
  brightCyan: "#2a959d",
  brightWhite: "#3a3a3e",
} as const;

/**
 * Reads the live glass tokens into an xterm theme. The background is
 * transparent so the frosted panel shows through (xterm needs
 * `allowTransparency`). Call again when <html>'s class or style changes.
 */
export function readTerminalTheme(): ITheme {
  const root = document.documentElement;
  const styles = getComputedStyle(root);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  const dark = root.classList.contains("dark");
  return {
    ...(dark ? DARK_ANSI : LIGHT_ANSI),
    background: "rgba(0, 0, 0, 0)",
    foreground: token("--fg", dark ? "#ededee" : "#1c1c1e"),
    cursor: token("--fg", dark ? "#ededee" : "#1c1c1e"),
    cursorAccent: token("--surface", dark ? "#141416" : "#fbfbfa"),
    selectionBackground: dark ? "rgba(139, 127, 248, 0.35)" : "rgba(109, 94, 245, 0.25)",
    selectionInactiveBackground: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.1)",
  };
}

/** The app's mono stack, resolved so xterm measures the same font CSS renders. */
export function readTerminalFontFamily(): string {
  const mono =
    getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim() ||
    'ui-monospace, "SF Mono", Menlo, monospace';
  // Prompt themes draw icons from Nerd Font private-use glyphs. Glass doesn't
  // bundle one, so fall back to a locally installed Nerd Font when present.
  return `${mono}, "Symbols Nerd Font Mono", "JetBrainsMono Nerd Font", "MesloLGS NF"`;
}
