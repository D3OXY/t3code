import { create } from "zustand";

/** Whether the command palette is open; toggled by Mod+K and the title bar. */
export const usePalette = create<{
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
