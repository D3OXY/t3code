import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Device-local diff viewer preferences shared by every thread's Changes pane. */
export const useDiffPrefs = create<{
  readonly diffStyle: "unified" | "split";
  readonly wrap: boolean;
  readonly setDiffStyle: (diffStyle: "unified" | "split") => void;
  readonly toggleWrap: () => void;
}>()(
  persist(
    (set) => ({
      diffStyle: "unified",
      wrap: false,
      setDiffStyle: (diffStyle) => set({ diffStyle }),
      toggleWrap: () => set((state) => ({ wrap: !state.wrap })),
    }),
    { name: "glass:diff:v1" },
  ),
);
