import { useSyncExternalStore } from "react";

export type DocumentTheme = "light" | "dark";

const read = (): DocumentTheme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/**
 * The resolved light/dark theme as applied to <html> by the appearance store,
 * so "system" mode is already folded in. For renderers that need a theme name.
 */
export function useDocumentTheme(): DocumentTheme {
  return useSyncExternalStore(subscribe, read, () => "dark");
}
