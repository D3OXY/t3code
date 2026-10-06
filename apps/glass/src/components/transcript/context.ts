import type { OrchestrationV2RuntimeRequest } from "@t3tools/contracts";
import { createContext, use } from "react";
import { create } from "zustand";

import type { ThreadTab } from "~/stores/tabs";

/** Thread-wide facts transcript rows read without each subscribing to the projection. */
export interface TranscriptContextValue {
  readonly threadRef: ThreadTab;
  /** Root for showing file paths relative to the workspace. */
  readonly workspaceRoot: string | null;
  /** A run is in progress; the trailing tool group stays open while it is. */
  readonly running: boolean;
  readonly trailingGroupId: string | null;
  readonly requestsById: ReadonlyMap<string, OrchestrationV2RuntimeRequest>;
}

export const TranscriptContext = createContext<TranscriptContextValue | null>(null);

/** Reads the transcript context; only valid inside a `Transcript`. */
export function useTranscript(): TranscriptContextValue {
  const value = use(TranscriptContext);
  if (value === null) throw new Error("useTranscript must be used inside a Transcript.");
  return value;
}

const useDisclosureStore = create<{ readonly open: Readonly<Record<string, boolean>> }>(() => ({
  open: {},
}));

/**
 * Open state for a transcript disclosure, keyed by item id so it survives the
 * row being virtualized away. `fallback` applies until the user toggles it,
 * after which their choice is pinned.
 */
export function useDisclosure(id: string, fallback = false): readonly [boolean, () => void] {
  const pinned = useDisclosureStore((state) => state.open[id]);
  const open = pinned ?? fallback;
  const toggle = () =>
    useDisclosureStore.setState((state) => ({ open: { ...state.open, [id]: !open } }));
  return [open, toggle];
}
