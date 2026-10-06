import { useAtomValue } from "@effect/atom-react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { TooltipProvider } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import { useActiveThreadRef, useCloseTab, useOpenThread } from "~/lib/navigation";
import { matchesShortcut, SHORTCUTS, tabIndexShortcut } from "~/lib/shortcuts";
import { isAttentionStatus, sectionSessions, sessionRowsAtom } from "~/state/sessions";
import { appAtomRegistry } from "~/state/registry";
import { ConfirmHost } from "~/stores/confirm";
import { useLayout } from "~/stores/layout";
import { usePalette } from "~/stores/palette";
import { useTabs } from "~/stores/tabs";
import { ToastHost } from "~/stores/toasts";
import { CommandPalette } from "./CommandPalette";
import { Sidebar } from "./Sidebar";
import { TabStrip } from "./TabStrip";

/**
 * The app frame: wallpaper, floating glass sidebar, and the main panel. On the
 * new-session canvas the main panel is clear so the wallpaper is the hero; on a
 * thread it becomes a frosted panel so the transcript stays readable.
 */
export function Shell() {
  const onCanvas = useRouterState({ select: (state) => state.location.pathname === "/" });
  useGlobalShortcuts();
  useAttentionTitle();

  return (
    <TooltipProvider delay={500}>
      <div className="relative flex h-full overflow-hidden">
        <div className="wallpaper" aria-hidden />
        <Sidebar />
        <main className="relative z-0 flex min-w-0 flex-1 flex-col p-2">
          <div
            className={cn(
              "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border transition-[background-color,border-color] duration-300",
              onCanvas ? "border-transparent" : "glass-panel border-line",
            )}
          >
            <TabStrip onCanvas={onCanvas} />
            <div className="relative flex min-h-0 flex-1">
              <Outlet />
            </div>
          </div>
        </main>
        <CommandPalette />
        <ConfirmHost />
        <ToastHost />
      </div>
    </TooltipProvider>
  );
}

function useGlobalShortcuts() {
  const navigate = useNavigate();
  const active = useActiveThreadRef();
  const openThread = useOpenThread();
  const closeTab = useCloseTab();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const layout = useLayout.getState();
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };
      if (matchesShortcut(event, SHORTCUTS.palette)) {
        return run(() => usePalette.getState().setOpen(!usePalette.getState().open));
      }
      if (matchesShortcut(event, SHORTCUTS.toggleSidebar)) return run(layout.toggleSidebar);
      if (matchesShortcut(event, SHORTCUTS.toggleDiff)) return run(() => layout.toggleDiff());
      if (matchesShortcut(event, SHORTCUTS.toggleTerminal))
        return run(() => layout.toggleTerminal());
      if (matchesShortcut(event, SHORTCUTS.newSession))
        return run(() => void navigate({ to: "/" }));
      if (matchesShortcut(event, SHORTCUTS.settings))
        return run(() => void navigate({ to: "/settings" }));
      if (matchesShortcut(event, SHORTCUTS.closeTab) && active) return run(() => closeTab(active));

      const tabIndex = tabIndexShortcut(event);
      if (tabIndex !== null) {
        const tab = useTabs.getState().tabs[tabIndex];
        if (tab) run(() => openThread(tab));
        return;
      }

      const step = matchesShortcut(event, SHORTCUTS.nextSession)
        ? 1
        : matchesShortcut(event, SHORTCUTS.previousSession)
          ? -1
          : 0;
      if (step !== 0) {
        run(() => {
          const { pinned, sessions } = sectionSessions(appAtomRegistry.get(sessionRowsAtom));
          const ordered = [...pinned, ...sessions];
          const index = ordered.findIndex(
            (row) =>
              row.shell.environmentId === active?.environmentId && row.shell.id === active.threadId,
          );
          const next = ordered[index === -1 ? (step > 0 ? 0 : ordered.length - 1) : index + step];
          if (next)
            openThread({ environmentId: next.shell.environmentId, threadId: next.shell.id });
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, closeTab, navigate, openThread]);
}

// "(2) T3 Glass" when sessions are blocked on the user, so a background tab
// still signals that an agent needs approval, an answer, or a look at a failure.
function useAttentionTitle() {
  const rows = useAtomValue(sessionRowsAtom);
  const attention = rows.filter((row) => isAttentionStatus(row.status)).length;
  useEffect(() => {
    document.title = attention > 0 ? `(${attention}) T3 Glass` : "T3 Glass";
  }, [attention]);
}
