import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { FileDiff, PanelLeft, Plus, SquareTerminal, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/Button";
import { ProviderIcon, useProviderInstance } from "~/components/ui/ProviderIcon";
import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import { shortcutLabel } from "~/lib/format";
import { useActiveThreadRef, useCloseTab, useOpenThread } from "~/lib/navigation";
import { appAtomRegistry } from "~/state/registry";
import { environmentShell } from "~/state/atoms";
import { sessionKey, sessionRowByKeyAtom } from "~/state/sessions";
import { useLayout } from "~/stores/layout";
import { sameTab, useTabs, type ThreadTab } from "~/stores/tabs";
import { AgentUpdatesButton } from "./AgentPill";
import { StatusDot } from "./StatusGlyph";

/** The main panel's title bar: open-session tabs plus the panel toggles. */
export function TabStrip({ onCanvas }: { readonly onCanvas: boolean }) {
  const tabs = useTabs((state) => state.tabs);
  const move = useTabs((state) => state.move);
  const active = useActiveThreadRef();
  const collapsed = useLayout((state) => state.sidebarCollapsed);
  const toggleSidebar = useLayout((state) => state.toggleSidebar);
  const diffOpen = useLayout((state) => state.diffOpen);
  const toggleDiff = useLayout((state) => state.toggleDiff);
  const terminalOpen = useLayout((state) => state.terminalOpen);
  const toggleTerminal = useLayout((state) => state.toggleTerminal);
  const navigate = useNavigate();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // The active thread always has a tab, even when reached by URL.
  useEffect(() => {
    if (active) useTabs.getState().open(active);
  }, [active]);

  usePruneMissingTabs();

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 px-2">
      {collapsed ? (
        <>
          <Tooltip label="Show sidebar" shortcut={shortcutLabel("mod+s")}>
            <Button size="icon" variant="ghost" aria-label="Show sidebar" onClick={toggleSidebar}>
              <PanelLeft className="size-4" />
            </Button>
          </Tooltip>
          <Tooltip label="New session" shortcut={shortcutLabel("alt+n")}>
            <Button
              size="icon"
              variant="ghost"
              aria-label="New session"
              onClick={() => void navigate({ to: "/" })}
            >
              <Plus className="size-4" />
            </Button>
          </Tooltip>
        </>
      ) : null}
      <div
        className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        role="tablist"
      >
        {tabs.map((tab, index) => (
          <TabButton
            key={sessionKey(tab.environmentId, tab.threadId)}
            tab={tab}
            active={active !== null && sameTab(active, tab)}
            dragging={dragIndex === index}
            onCanvas={onCanvas}
            onDragStart={() => setDragIndex(index)}
            onDragEnter={() => {
              if (dragIndex === null || dragIndex === index) return;
              move(dragIndex, index);
              setDragIndex(index);
            }}
            onDragEnd={() => setDragIndex(null)}
          />
        ))}
      </div>
      {onCanvas ? null : (
        <div className="flex shrink-0 items-center gap-0.5">
          <AgentUpdatesButton />
          <Tooltip
            label={terminalOpen ? "Hide terminal" : "Show terminal"}
            shortcut={shortcutLabel("mod+j")}
          >
            <Button
              size="icon"
              variant="ghost"
              aria-label="Toggle terminal"
              aria-pressed={terminalOpen}
              className={terminalOpen ? "text-fg" : undefined}
              onClick={() => toggleTerminal()}
            >
              <SquareTerminal className="size-4" />
            </Button>
          </Tooltip>
          <Tooltip
            label={diffOpen ? "Hide changes" : "Show changes"}
            shortcut={shortcutLabel("mod+b")}
          >
            <Button
              size="icon"
              variant="ghost"
              aria-label="Toggle changes"
              aria-pressed={diffOpen}
              className={diffOpen ? "text-fg" : undefined}
              onClick={() => toggleDiff()}
            >
              <FileDiff className="size-4" />
            </Button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

function TabButton({
  tab,
  active,
  dragging,
  onCanvas,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  readonly tab: ThreadTab;
  readonly active: boolean;
  readonly dragging: boolean;
  /** Over the bare wallpaper, tabs need their own glass to stay legible. */
  readonly onCanvas: boolean;
  readonly onDragStart: () => void;
  readonly onDragEnter: () => void;
  readonly onDragEnd: () => void;
}) {
  const row = useAtomValue(sessionRowByKeyAtom(sessionKey(tab.environmentId, tab.threadId)));
  const provider = useProviderInstance(
    tab.environmentId,
    row?.shell.modelSelection.instanceId ?? null,
  );
  const openThread = useOpenThread();
  const closeTab = useCloseTab();
  return (
    <div
      role="tab"
      aria-selected={active}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      onAuxClick={(event) => {
        if (event.button === 1) closeTab(tab);
      }}
      className={cn(
        "group flex h-8 max-w-56 min-w-28 shrink-0 cursor-default items-center gap-2 rounded-lg pr-1 pl-2.5 text-[13px] transition-colors duration-150 select-none",
        active
          ? "bg-active text-fg"
          : onCanvas
            ? "glass border border-line text-fg/85 hover:text-fg"
            : "text-muted hover:bg-hover hover:text-fg",
        dragging && "opacity-50",
      )}
      onClick={() => openThread(tab)}
    >
      {row && row.status !== "idle" ? (
        <StatusDot status={row.status} />
      ) : (
        <ProviderIcon provider={provider} size="xs" />
      )}
      <span className={cn("min-w-0 flex-1 truncate", row?.unread && "font-semibold")}>
        {row?.shell.title ?? "Session"}
      </span>
      <button
        type="button"
        aria-label="Close tab"
        onClick={(event) => {
          event.stopPropagation();
          closeTab(tab);
        }}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md text-faint hover:bg-active hover:text-fg",
          active ? "visible" : "invisible group-hover:visible",
        )}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

// Tabs for threads that were deleted or archived elsewhere close themselves,
// but only once that environment's shell is live, so a cold boot never drops tabs.
function usePruneMissingTabs() {
  useEffect(() => {
    const check = () =>
      useTabs.getState().prune((tab) => {
        const state = appAtomRegistry.get(environmentShell.stateValueAtom(tab.environmentId));
        if (state.status !== "live" || state.snapshot._tag !== "Some") return true;
        return state.snapshot.value.threads.some((thread) => thread.id === tab.threadId);
      });
    const timer = window.setInterval(check, 5_000);
    return () => window.clearInterval(timer);
  }, []);
}
