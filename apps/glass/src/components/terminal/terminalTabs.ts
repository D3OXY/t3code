import { nextTerminalId } from "@t3tools/shared/terminalLabels";
import { create } from "zustand";

export const DEFAULT_TERMINAL_ID = "term-1";

/** Local edits on top of the server's terminal list for one thread. */
export interface ThreadTerminalTabs {
  /** Created here and possibly not yet reported by the server. */
  readonly created: ReadonlyArray<string>;
  /** Closed here; hidden until the server stops reporting them. */
  readonly closed: ReadonlyArray<string>;
  readonly active: string | null;
}

const EMPTY: ThreadTerminalTabs = { created: [], closed: [], active: null };
const compareIds = new Intl.Collator(undefined, { numeric: true }).compare;

/**
 * The tabs to show: terminals the server knows for this thread plus ones
 * created locally, minus ones closed locally, in term-N order. Never empty, so
 * opening the panel always attaches (and thereby starts) a shell.
 */
export function visibleTerminalIds(
  serverIds: ReadonlyArray<string>,
  local: ThreadTerminalTabs = EMPTY,
): ReadonlyArray<string> {
  const closed = new Set(local.closed);
  const ids = [...new Set([...serverIds, ...local.created])]
    .filter((id) => !closed.has(id))
    .sort(compareIds);
  return ids.length > 0 ? ids : [DEFAULT_TERMINAL_ID];
}

interface TerminalTabsState {
  readonly byThread: Readonly<Record<string, ThreadTerminalTabs>>;
  /** Adds the next free term-N after `visible` and makes it active; returns its id. */
  readonly create: (threadKey: string, visible: ReadonlyArray<string>) => string;
  /** Hides a tab and activates its neighbor; returns the ids left visible. */
  readonly close: (
    threadKey: string,
    id: string,
    visible: ReadonlyArray<string>,
  ) => ReadonlyArray<string>;
  readonly setActive: (threadKey: string, id: string) => void;
  /** Forgets closed ids the server no longer reports, so a reused id can show again. */
  readonly pruneClosed: (threadKey: string, serverIds: ReadonlyArray<string>) => void;
}

/** Per-thread terminal tabs for this page session; the server owns the processes. */
export const useTerminalTabs = create<TerminalTabsState>((set, get) => {
  const update = (threadKey: string, change: (tabs: ThreadTerminalTabs) => ThreadTerminalTabs) =>
    set((state) => ({
      byThread: { ...state.byThread, [threadKey]: change(state.byThread[threadKey] ?? EMPTY) },
    }));
  return {
    byThread: {},
    create: (threadKey, visible) => {
      const id = nextTerminalId(visible);
      update(threadKey, (tabs) => ({
        created: [...tabs.created.filter((existing) => existing !== id), id],
        closed: tabs.closed.filter((existing) => existing !== id),
        active: id,
      }));
      return id;
    },
    close: (threadKey, id, visible) => {
      const index = visible.indexOf(id);
      const remaining = visible.filter((existing) => existing !== id);
      update(threadKey, (tabs) => ({
        created: tabs.created.filter((existing) => existing !== id),
        closed: [...tabs.closed.filter((existing) => existing !== id), id],
        active:
          tabs.active === id
            ? (remaining[Math.min(index, remaining.length - 1)] ?? null)
            : tabs.active,
      }));
      return remaining;
    },
    setActive: (threadKey, id) => update(threadKey, (tabs) => ({ ...tabs, active: id })),
    pruneClosed: (threadKey, serverIds) => {
      const tabs = get().byThread[threadKey];
      if (!tabs || tabs.closed.every((id) => serverIds.includes(id))) return;
      update(threadKey, (current) => ({
        ...current,
        closed: current.closed.filter((id) => serverIds.includes(id)),
      }));
    },
  };
});
