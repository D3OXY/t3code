/** Compact relative age like the sidebar shows: now, 5m, 2h, 3d, 1w, 4mo. */
export function relativeAge(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/** Elapsed time for a running agent: 8s, 1m 05s, 1h 02m. */
export function elapsed(fromIso: string | null | undefined, now = Date.now()): string {
  if (!fromIso) return "";
  const start = Date.parse(fromIso);
  if (Number.isNaN(start)) return "";
  const total = Math.max(0, Math.floor((now - start) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export const isMac =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/** Renders a shortcut spec like "mod+k" or "alt+shift+n" for the current platform. */
export function shortcutLabel(spec: string): string {
  return spec
    .split("+")
    .map((part) => {
      switch (part) {
        case "mod":
          return isMac ? "⌘" : "Ctrl";
        case "alt":
          return isMac ? "⌥" : "Alt";
        case "shift":
          return isMac ? "⇧" : "Shift";
        case "ctrl":
          return isMac ? "⌃" : "Ctrl";
        case "enter":
          return "↵";
        case "up":
          return "↑";
        case "down":
          return "↓";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(isMac ? "" : "+");
}

/** The last path segment, for compact project and worktree labels. */
export function basename(path: string | null | undefined): string {
  if (!path) return "";
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed.slice(Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1);
}
