import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ThreadTab {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}

export const sameTab = (a: ThreadTab, b: ThreadTab) =>
  a.environmentId === b.environmentId && a.threadId === b.threadId;

interface TabsState {
  readonly tabs: ReadonlyArray<ThreadTab>;
  /** Opens a tab after the active one, or keeps an existing tab where it is. */
  readonly open: (tab: ThreadTab, after?: ThreadTab | null) => void;
  /** Closes a tab and returns the tab that should become active, if any. */
  readonly close: (tab: ThreadTab, active: ThreadTab | null) => ThreadTab | null;
  readonly move: (from: number, to: number) => void;
  /** Drops tabs whose thread no longer exists. */
  readonly prune: (exists: (tab: ThreadTab) => boolean) => void;
}

/**
 * Tabs are a device-local viewport onto the session list: closing a tab never
 * archives or deletes the thread. Archiving is an explicit sidebar action.
 */
export const useTabs = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      open: (tab, after) =>
        set((state) => {
          if (state.tabs.some((existing) => sameTab(existing, tab))) return state;
          const anchor = after ? state.tabs.findIndex((existing) => sameTab(existing, after)) : -1;
          const tabs = [...state.tabs];
          tabs.splice(anchor === -1 ? tabs.length : anchor + 1, 0, tab);
          return { tabs };
        }),
      close: (tab, active) => {
        const tabs = get().tabs;
        const index = tabs.findIndex((existing) => sameTab(existing, tab));
        if (index === -1) return active;
        const next = tabs.filter((_, i) => i !== index);
        set({ tabs: next });
        if (active === null || !sameTab(active, tab)) return active;
        return next[Math.min(index, next.length - 1)] ?? null;
      },
      move: (from, to) =>
        set((state) => {
          if (from === to) return state;
          const tabs = [...state.tabs];
          const [moved] = tabs.splice(from, 1);
          if (moved === undefined) return state;
          tabs.splice(to, 0, moved);
          return { tabs };
        }),
      prune: (exists) =>
        set((state) => {
          const tabs = state.tabs.filter(exists);
          return tabs.length === state.tabs.length ? state : { tabs };
        }),
    }),
    { name: "glass:tabs:v1" },
  ),
);
