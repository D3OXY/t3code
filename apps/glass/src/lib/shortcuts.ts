import { isMac } from "./format";

/**
 * App shortcuts. Specs use "mod" for ⌘ on macOS and Ctrl elsewhere. Browser
 * chrome owns ⌘N/⌘W/⌘1-9, so tab and session shortcuts use Alt instead.
 */
export const SHORTCUTS = {
  palette: "mod+k",
  toggleSidebar: "mod+s",
  toggleDiff: "mod+b",
  toggleTerminal: "mod+j",
  newSession: "alt+n",
  closeTab: "alt+w",
  previousSession: "alt+up",
  nextSession: "alt+down",
  settings: "mod+,",
} as const;

export type ShortcutId = keyof typeof SHORTCUTS;

const KEY_ALIASES: Record<string, string> = {
  arrowup: "up",
  arrowdown: "down",
  arrowleft: "left",
  arrowright: "right",
  escape: "esc",
};

/** Whether a keyboard event matches a spec like "mod+shift+k". */
export function matchesShortcut(event: KeyboardEvent, spec: string): boolean {
  const parts = spec.split("+");
  const key = parts[parts.length - 1];
  const wants = new Set(parts.slice(0, -1));
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (wants.has("mod") !== mod) return false;
  if (wants.has("alt") !== event.altKey) return false;
  if (wants.has("shift") !== event.shiftKey) return false;
  // Off macOS, Ctrl is "mod" and was checked above.
  if (isMac && wants.has("ctrl") !== event.ctrlKey) return false;
  // Alt changes event.key on macOS (⌥N → ˜), so compare physical keys for letters/digits.
  const code = event.code.toLowerCase();
  const physical = code.startsWith("key")
    ? code.slice(3)
    : code.startsWith("digit")
      ? code.slice(5)
      : null;
  const pressed = KEY_ALIASES[event.key.toLowerCase()] ?? event.key.toLowerCase();
  return pressed === key || physical === key;
}

/** Alt+1..9 → tab index 0..8, or null. */
export function tabIndexShortcut(event: KeyboardEvent): number | null {
  if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return null;
  const match = /^Digit([1-9])$/.exec(event.code);
  return match ? Number(match[1]) - 1 : null;
}
