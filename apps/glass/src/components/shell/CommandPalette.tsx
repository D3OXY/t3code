import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  Check,
  FileDiff,
  GitBranch,
  Image,
  Layers,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  Settings2,
  SquarePen,
  SquareTerminal,
  Sun,
} from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";

import { Dialog, DialogPopup } from "~/components/ui/Dialog";
import { Kbd } from "~/components/ui/Kbd";
import { ProviderIcon, useProviderInstance } from "~/components/ui/ProviderIcon";
import { cn } from "~/lib/cn";
import { relativeAge, shortcutLabel } from "~/lib/format";
import { useOpenThread } from "~/lib/navigation";
import { SHORTCUTS } from "~/lib/shortcuts";
import { useNow } from "~/lib/useNow";
import { sessionRowsAtom, type SessionRow } from "~/state/sessions";
import { useAppearance, WALLPAPERS } from "~/stores/appearance";
import { useLayout } from "~/stores/layout";
import { usePalette } from "~/stores/palette";
import { matchFields } from "./paletteSearch";
import { StatusGlyph } from "./StatusGlyph";

/** The Mod+K palette: app actions plus a fuzzy jump to any session. Mounted once in Shell. */
export function CommandPalette() {
  const open = usePalette((state) => state.open);
  const setOpen = usePalette((state) => state.setOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPopup position="top" initialFocus={inputRef} size="xl">
        <PaletteBody inputRef={inputRef} onClose={() => setOpen(false)} />
      </DialogPopup>
    </Dialog>
  );
}

interface PaletteAction {
  readonly id: string;
  readonly label: string;
  readonly keywords: string;
  readonly icon: ReactNode;
  readonly shortcut?: string;
  readonly checked?: boolean;
  readonly run: () => void;
}

type PaletteEntry =
  | {
      readonly kind: "action";
      readonly key: string;
      readonly action: PaletteAction;
      readonly highlights: ReadonlyArray<number>;
    }
  | {
      readonly kind: "session";
      readonly key: string;
      readonly row: SessionRow;
      readonly highlights: ReadonlyArray<ReadonlyArray<number>>;
    };

const SESSION_LIMIT_EMPTY = 40;
const SESSION_LIMIT_SEARCH = 80;

function PaletteBody({
  inputRef,
  onClose,
}: {
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const actions = usePaletteActions();
  const rows = useAtomValue(sessionRowsAtom);
  const openThread = useOpenThread();

  const entries = useMemo((): ReadonlyArray<PaletteEntry> => {
    const actionEntries = actions.flatMap((action): PaletteEntry[] => {
      const match = matchFields(query, [
        { text: action.label, weight: 1 },
        { text: action.keywords, weight: 0.5 },
      ]);
      return match
        ? [{ kind: "action", key: action.id, action, highlights: match.highlights[0] ?? [] }]
        : [];
    });
    const scored = rows.flatMap((row) => {
      const match = matchFields(query, [
        { text: row.shell.title, weight: 1 },
        { text: row.project?.title ?? "", weight: 0.7 },
        { text: row.shell.branch ?? "", weight: 0.6 },
        { text: row.environmentLabel, weight: 0.4 },
      ]);
      return match ? [{ row, match }] : [];
    });
    scored.sort(
      (a, b) => b.match.score - a.match.score || b.row.activityAt.localeCompare(a.row.activityAt),
    );
    const sessionEntries = scored
      .slice(0, query.trim() === "" ? SESSION_LIMIT_EMPTY : SESSION_LIMIT_SEARCH)
      .map(({ row, match }): PaletteEntry => ({
        kind: "session",
        key: row.key,
        row,
        highlights: match.highlights,
      }));
    return [...actionEntries, ...sessionEntries];
  }, [actions, query, rows]);

  const active = Math.min(activeIndex, Math.max(0, entries.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-palette-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (entry: PaletteEntry | undefined) => {
    if (!entry) return;
    onClose();
    if (entry.kind === "action") entry.action.run();
    else openThread({ environmentId: entry.row.shell.environmentId, threadId: entry.row.shell.id });
  };

  const step = (delta: number) => {
    if (entries.length === 0) return;
    setActiveIndex((active + delta + entries.length) % entries.length);
  };

  const firstSessionIndex = entries.findIndex((entry) => entry.kind === "session");
  const hasActions = firstSessionIndex !== 0 && entries.length > 0;

  return (
    <div className="flex flex-col">
      <div className="flex h-14 items-center gap-3 border-b border-line px-4">
        <Search className="size-[18px] shrink-0 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            const ctrl = event.ctrlKey && !event.metaKey && !event.altKey;
            if (event.key === "ArrowDown" || (ctrl && event.key === "n")) {
              event.preventDefault();
              step(1);
            } else if (event.key === "ArrowUp" || (ctrl && event.key === "p")) {
              event.preventDefault();
              step(-1);
            } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              run(entries[active]);
            }
          }}
          placeholder="Type a command or search sessions…"
          aria-label="Command palette"
          aria-activedescendant={entries[active] ? `palette-${entries[active].key}` : undefined}
          aria-controls="palette-list"
          role="combobox"
          aria-expanded
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
        />
        <Kbd>{shortcutLabel(SHORTCUTS.palette)}</Kbd>
      </div>

      <div
        ref={listRef}
        id="palette-list"
        role="listbox"
        className="max-h-[min(28rem,60vh)] overflow-y-auto overscroll-contain p-2"
      >
        {entries.length === 0 ? (
          <div className="px-3 py-8 text-center text-[13px] text-muted">
            No matches for “{query.trim()}”
          </div>
        ) : null}
        {hasActions ? <SectionLabel>Actions</SectionLabel> : null}
        {entries.map((entry, index) => (
          <div key={entry.key}>
            {index === firstSessionIndex ? (
              <>
                {hasActions ? <div className="-mx-2 my-2 h-px bg-line" /> : null}
                <SectionLabel>Sessions</SectionLabel>
              </>
            ) : null}
            <div
              id={`palette-${entry.key}`}
              role="option"
              aria-selected={index === active}
              data-palette-index={index}
              onPointerMove={() => index !== active && setActiveIndex(index)}
              onClick={() => run(entry)}
              className={cn(
                "cursor-default rounded-xl transition-colors duration-100",
                index === active ? "bg-active" : null,
              )}
            >
              {entry.kind === "action" ? (
                <ActionRow action={entry.action} highlights={entry.highlights} />
              ) : (
                <SessionRowItem row={entry.row} highlights={entry.highlights} />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex h-11 items-center gap-4 border-t border-line px-4 text-[11.5px] text-faint">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd>
          Navigate
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd>
          Open
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>esc</Kbd>
          Close
        </span>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { readonly children: ReactNode }) {
  return <div className="px-2 pt-1 pb-1.5 text-[11.5px] font-medium text-faint">{children}</div>;
}

function ActionRow({
  action,
  highlights,
}: {
  readonly action: PaletteAction;
  readonly highlights: ReadonlyArray<number>;
}) {
  return (
    <div className="flex h-9 items-center gap-3 px-2.5 text-[13.5px]">
      <span className="grid size-4 shrink-0 place-items-center text-muted">{action.icon}</span>
      <span className="min-w-0 flex-1 truncate">
        <Highlighted text={action.label} indices={highlights} />
      </span>
      {action.checked ? <Check className="size-3.5 shrink-0 text-muted" /> : null}
      {action.shortcut ? <Kbd>{shortcutLabel(action.shortcut)}</Kbd> : null}
    </div>
  );
}

function SessionRowItem({
  row,
  highlights,
}: {
  readonly row: SessionRow;
  readonly highlights: ReadonlyArray<ReadonlyArray<number>>;
}) {
  const now = useNow();
  const provider = useProviderInstance(
    row.shell.environmentId,
    row.shell.modelSelection.instanceId,
  );
  const [titleHits = [], projectHits = [], branchHits = []] = highlights;
  return (
    <div className="px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-faint">
          <Highlighted text={row.project?.title ?? "Project"} indices={projectHits} /> @{" "}
          {row.environmentLabel}
        </span>
        <StatusGlyph status={row.status} age={relativeAge(row.activityAt, now)} />
      </div>
      <div className="mt-0.5 flex items-center gap-2">
        <ProviderIcon provider={provider} size="sm" />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13.5px]",
            row.unread ? "font-semibold text-fg" : "text-fg/90",
          )}
        >
          <Highlighted text={row.shell.title} indices={titleHits} />
        </span>
      </div>
      {row.shell.branch ? (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
          <GitBranch className="size-3 shrink-0" />
          <span className="min-w-0 truncate">
            <Highlighted text={row.shell.branch} indices={branchHits} />
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Renders `text` with the matched character indices marked. */
function Highlighted({
  text,
  indices,
}: {
  readonly text: string;
  readonly indices: ReadonlyArray<number>;
}) {
  if (indices.length === 0) return text;
  const hits = new Set(indices);
  const parts: Array<{ start: number; text: string; hit: boolean }> = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index] ?? "";
    const hit = hits.has(index);
    const last = parts[parts.length - 1];
    if (last && last.hit === hit) last.text += char;
    else parts.push({ start: index, text: char, hit });
  }
  return parts.map((part) =>
    part.hit ? (
      <mark key={part.start} className="rounded-[3px] bg-accent/30 text-fg">
        {part.text}
      </mark>
    ) : (
      <span key={part.start}>{part.text}</span>
    ),
  );
}

/** The palette's action list; labels and checks follow the current layout and appearance. */
function usePaletteActions(): ReadonlyArray<PaletteAction> {
  const navigate = useNavigate();
  const layout = useLayout();
  const appearance = useAppearance();
  return useMemo(() => {
    const wallpapers = WALLPAPERS.filter(
      (wallpaper) => wallpaper.id !== "custom" || appearance.customWallpaper !== null,
    );
    const wallpaperIndex = wallpapers.findIndex(
      (wallpaper) => wallpaper.id === appearance.wallpaper,
    );
    const nextWallpaper = wallpapers[(wallpaperIndex + 1) % wallpapers.length] ?? wallpapers[0];
    return [
      {
        id: "new-session",
        label: "New session",
        keywords: "chat create start",
        icon: <SquarePen className="size-4" />,
        shortcut: SHORTCUTS.newSession,
        run: () => void navigate({ to: "/" }),
      },
      {
        id: "settings",
        label: "Open settings",
        keywords: "preferences environments providers",
        icon: <Settings2 className="size-4" />,
        shortcut: SHORTCUTS.settings,
        run: () => void navigate({ to: "/settings" }),
      },
      {
        id: "toggle-sidebar",
        label: layout.sidebarCollapsed ? "Show sidebar" : "Hide sidebar",
        keywords: "toggle sessions panel",
        icon: <PanelLeft className="size-4" />,
        shortcut: SHORTCUTS.toggleSidebar,
        run: layout.toggleSidebar,
      },
      {
        id: "toggle-diff",
        label: layout.diffOpen ? "Hide changes" : "Show changes",
        keywords: "toggle diff review files",
        icon: <FileDiff className="size-4" />,
        shortcut: SHORTCUTS.toggleDiff,
        run: () => layout.toggleDiff(),
      },
      {
        id: "toggle-terminal",
        label: layout.terminalOpen ? "Hide terminal" : "Show terminal",
        keywords: "toggle shell console",
        icon: <SquareTerminal className="size-4" />,
        shortcut: SHORTCUTS.toggleTerminal,
        run: () => layout.toggleTerminal(),
      },
      {
        id: "show-archived",
        label: "Show archived sessions",
        keywords: "archive history",
        icon: <Archive className="size-4" />,
        run: () => {
          layout.setShowArchived(true);
          if (layout.sidebarCollapsed) layout.toggleSidebar();
        },
      },
      {
        id: "theme-light",
        label: "Theme: Light",
        keywords: "appearance mode",
        icon: <Sun className="size-4" />,
        checked: appearance.mode === "light",
        run: () => appearance.setMode("light"),
      },
      {
        id: "theme-dark",
        label: "Theme: Dark",
        keywords: "appearance mode",
        icon: <Moon className="size-4" />,
        checked: appearance.mode === "dark",
        run: () => appearance.setMode("dark"),
      },
      {
        id: "theme-system",
        label: "Theme: System",
        keywords: "appearance mode auto",
        icon: <Monitor className="size-4" />,
        checked: appearance.mode === "system",
        run: () => appearance.setMode("system"),
      },
      ...(nextWallpaper
        ? [
            {
              id: "next-wallpaper",
              label: `Next wallpaper (${nextWallpaper.label})`,
              keywords: "background appearance",
              icon: <Image className="size-4" />,
              run: () => appearance.setWallpaper(nextWallpaper.id),
            },
          ]
        : []),
      {
        id: "toggle-surface",
        label: appearance.surface === "frost" ? "Use opaque surfaces" : "Use frosted glass",
        keywords: "appearance transparency blur",
        icon: <Layers className="size-4" />,
        run: () => appearance.setSurface(appearance.surface === "frost" ? "opaque" : "frost"),
      },
    ];
  }, [appearance, layout, navigate]);
}
