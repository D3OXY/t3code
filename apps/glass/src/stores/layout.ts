import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SIDEBAR_MIN_WIDTH = 208;
export const SIDEBAR_MAX_WIDTH = 400;
export const SIDEBAR_DEFAULT_WIDTH = 272;
export const SIDE_PANE_MIN_WIDTH = 360;
export const SIDE_PANE_MAX_WIDTH = 760;
export const SIDE_PANE_DEFAULT_WIDTH = 520;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type SidebarGrouping = "flat" | "project";

interface LayoutState {
  readonly sidebarWidth: number;
  readonly sidebarCollapsed: boolean;
  readonly sidebarGrouping: SidebarGrouping;
  /** Project filter for the sidebar; null means all projects. Keyed `${environmentId}:${projectId}`. */
  readonly projectFilter: string | null;
  readonly showArchived: boolean;
  readonly diffOpen: boolean;
  readonly sidePaneWidth: number;
  readonly terminalOpen: boolean;
  readonly terminalHeight: number;
  readonly setSidebarWidth: (width: number) => void;
  readonly toggleSidebar: () => void;
  readonly setSidebarGrouping: (grouping: SidebarGrouping) => void;
  readonly setProjectFilter: (key: string | null) => void;
  readonly setShowArchived: (show: boolean) => void;
  readonly toggleDiff: (open?: boolean) => void;
  readonly setSidePaneWidth: (width: number) => void;
  readonly toggleTerminal: (open?: boolean) => void;
  readonly setTerminalHeight: (height: number) => void;
}

/** Device-local shell layout; nothing here is shared with the server. */
export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      sidebarCollapsed: false,
      sidebarGrouping: "flat",
      projectFilter: null,
      showArchived: false,
      diffOpen: false,
      sidePaneWidth: SIDE_PANE_DEFAULT_WIDTH,
      terminalOpen: false,
      terminalHeight: 280,
      setSidebarWidth: (width) =>
        set({ sidebarWidth: clamp(width, SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH) }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarGrouping: (sidebarGrouping) => set({ sidebarGrouping }),
      setProjectFilter: (projectFilter) => set({ projectFilter }),
      setShowArchived: (showArchived) => set({ showArchived }),
      toggleDiff: (open) => set((state) => ({ diffOpen: open ?? !state.diffOpen })),
      setSidePaneWidth: (width) =>
        set({ sidePaneWidth: clamp(width, SIDE_PANE_MIN_WIDTH, SIDE_PANE_MAX_WIDTH) }),
      toggleTerminal: (open) => set((state) => ({ terminalOpen: open ?? !state.terminalOpen })),
      setTerminalHeight: (height) =>
        set({ terminalHeight: clamp(height, 160, Math.round(window.innerHeight * 0.55)) }),
    }),
    { name: "glass:layout:v1" },
  ),
);
