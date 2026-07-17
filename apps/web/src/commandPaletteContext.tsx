import { createContext, use, type ReactNode } from "react";
import type { SidebarProjectGroupMember, SidebarProjectSnapshot } from "./sidebarProjectGrouping";

export type NewThreadProjectSelectionHandler = (
  project: SidebarProjectGroupMember,
) => void | Promise<void>;

const OpenAddProjectCommandPaletteContext = createContext<(() => void) | null>(null);
const OpenNewThreadProjectCommandPaletteContext = createContext<
  | ((
      projects: readonly SidebarProjectSnapshot[],
      onSelectProject?: NewThreadProjectSelectionHandler,
    ) => void)
  | null
>(null);

export function OpenAddProjectCommandPaletteProvider(props: {
  readonly children: ReactNode;
  readonly openAddProject: () => void;
  readonly openNewThreadProjectPicker: (
    projects: readonly SidebarProjectSnapshot[],
    onSelectProject?: NewThreadProjectSelectionHandler,
  ) => void;
}) {
  return (
    <OpenNewThreadProjectCommandPaletteContext value={props.openNewThreadProjectPicker}>
      <OpenAddProjectCommandPaletteContext value={props.openAddProject}>
        {props.children}
      </OpenAddProjectCommandPaletteContext>
    </OpenNewThreadProjectCommandPaletteContext>
  );
}

export function useOpenAddProjectCommandPalette(): () => void {
  const openAddProject = use(OpenAddProjectCommandPaletteContext);
  if (!openAddProject) {
    throw new Error("Command palette actions must be used inside CommandPalette");
  }
  return openAddProject;
}

export function useOpenNewThreadProjectCommandPalette(): (
  projects: readonly SidebarProjectSnapshot[],
  onSelectProject?: NewThreadProjectSelectionHandler,
) => void {
  const openNewThreadProjectPicker = use(OpenNewThreadProjectCommandPaletteContext);
  if (!openNewThreadProjectPicker) {
    throw new Error("Command palette actions must be used inside CommandPalette");
  }
  return openNewThreadProjectPicker;
}

/** Read at event time so the chat tree does not subscribe to transient dialog state. */
export function isCommandPaletteOpen(): boolean {
  return (
    typeof document !== "undefined" && document.querySelector("[data-command-palette]") !== null
  );
}
