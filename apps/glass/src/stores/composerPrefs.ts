import type { ModelSelection } from "@t3tools/contracts";
import type { ActiveTurnComposerAction } from "@t3tools/client-runtime/state/composer-dispatch";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** What Enter does while a turn runs; Mod+Enter does the other. */
export type FollowUpBehavior = Extract<ActiveTurnComposerAction, "queue" | "steer">;

interface ComposerPrefsState {
  readonly followUpBehavior: FollowUpBehavior;
  /** The last model the user picked, used when nothing more specific applies. */
  readonly stickyModelSelection: ModelSelection | null;
  readonly setFollowUpBehavior: (behavior: FollowUpBehavior) => void;
  readonly setStickyModelSelection: (selection: ModelSelection) => void;
}

/** Device-local composer preferences. Neither is a server setting, so each device keeps its own. */
export const useComposerPrefs = create<ComposerPrefsState>()(
  persist(
    (set) => ({
      followUpBehavior: "queue",
      stickyModelSelection: null,
      setFollowUpBehavior: (followUpBehavior) => set({ followUpBehavior }),
      setStickyModelSelection: (stickyModelSelection) => set({ stickyModelSelection }),
    }),
    { name: "glass:composer-prefs:v1" },
  ),
);
