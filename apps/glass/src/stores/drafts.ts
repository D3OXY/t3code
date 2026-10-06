import type {
  EnvironmentId,
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ScopedProjectRef,
} from "@t3tools/contracts";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

/** The new-session canvas has one draft; each thread keys its own by `sessionKey`. */
export const NEW_SESSION_DRAFT_KEY = "new";

export type CheckoutMode = "current" | "worktree";

/**
 * What the user has typed and chosen but not sent yet. Null settings mean
 * "inherit" (the thread's current value, or the project/server default for a
 * new session), so a draft never pins a stale value it did not ask for.
 */
export interface ComposerDraft {
  readonly text: string;
  readonly modelSelection: ModelSelection | null;
  readonly runtimeMode: RuntimeMode | null;
  readonly interactionMode: ProviderInteractionMode | null;
  /** New session only: the project the session starts in. */
  readonly project: ScopedProjectRef | null;
  /** New session only: run in the project checkout or a fresh worktree. */
  readonly checkout: CheckoutMode | null;
  /** New session only: the worktree base branch, or the branch of a reused worktree. */
  readonly branch: string | null;
  /** New session only: an existing worktree the session should reuse. */
  readonly worktreePath: string | null;
}

export const EMPTY_DRAFT: ComposerDraft = {
  text: "",
  modelSelection: null,
  runtimeMode: null,
  interactionMode: null,
  project: null,
  checkout: null,
  branch: null,
  worktreePath: null,
};

const isEmptyDraft = (draft: ComposerDraft) =>
  (Object.keys(EMPTY_DRAFT) as Array<keyof ComposerDraft>).every(
    (key) => draft[key] === EMPTY_DRAFT[key],
  );

interface DraftsState {
  readonly drafts: Readonly<Record<string, ComposerDraft>>;
  /** Merges a patch into a draft; drafts that become empty are dropped. */
  readonly update: (key: string, patch: Partial<ComposerDraft>) => void;
}

/**
 * Device-local composer drafts, persisted so a half-written prompt survives
 * navigation and reloads. Attachments hold `File`s and live in
 * `useComposerAttachments` instead.
 */
export const useDrafts = create<DraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      update: (key, patch) =>
        set((state) => {
          const next = { ...(state.drafts[key] ?? EMPTY_DRAFT), ...patch };
          const drafts = { ...state.drafts };
          if (isEmptyDraft(next)) delete drafts[key];
          else drafts[key] = next;
          return { drafts };
        }),
    }),
    { name: "glass:drafts:v1" },
  ),
);

export type DraftSettings = Omit<ComposerDraft, "text">;

/**
 * Reads one draft's settings without its text, so typing (saved on a debounce)
 * does not re-render the pickers that only care about choices.
 */
export function useDraftSettings(key: string): DraftSettings {
  return useDrafts(
    useShallow((state) => {
      const { text: _text, ...settings } = state.drafts[key] ?? EMPTY_DRAFT;
      return settings;
    }),
  );
}

export const readDraft = (key: string): ComposerDraft =>
  useDrafts.getState().drafts[key] ?? EMPTY_DRAFT;

export type AttachmentUpload =
  /** The server takes inline image bytes, so nothing is uploaded ahead of the send. */
  | { readonly status: "inline" }
  | {
      readonly status: "uploading";
      readonly environmentId: EnvironmentId;
      readonly progress: number;
    }
  | {
      readonly status: "ready";
      readonly environmentId: EnvironmentId;
      readonly attachmentId: string;
    }
  | {
      readonly status: "failed";
      readonly environmentId: EnvironmentId;
      readonly error: string;
    };

export interface ComposerAttachment {
  /** Local identity; the server id lives in `upload` once the bytes land. */
  readonly id: string;
  readonly kind: "image" | "file";
  readonly file: File;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** Object URL for image thumbnails; revoked when the attachment is dropped. */
  readonly previewUrl: string | null;
  readonly upload: AttachmentUpload;
}

const NO_ATTACHMENTS: ReadonlyArray<ComposerAttachment> = [];

interface AttachmentsState {
  readonly byKey: Readonly<Record<string, ReadonlyArray<ComposerAttachment>>>;
}

/** In-memory attachments per draft key. Files cannot be persisted, so a reload drops them. */
export const useComposerAttachments = create<AttachmentsState>()(() => ({ byKey: {} }));

export function useDraftAttachments(key: string): ReadonlyArray<ComposerAttachment> {
  return useComposerAttachments((state) => state.byKey[key] ?? NO_ATTACHMENTS);
}

export const readDraftAttachments = (key: string): ReadonlyArray<ComposerAttachment> =>
  useComposerAttachments.getState().byKey[key] ?? NO_ATTACHMENTS;

/** Replaces a draft's attachment list through an updater. */
export function setDraftAttachments(
  key: string,
  update: (current: ReadonlyArray<ComposerAttachment>) => ReadonlyArray<ComposerAttachment>,
) {
  useComposerAttachments.setState((state) => {
    const next = update(state.byKey[key] ?? NO_ATTACHMENTS);
    const byKey = { ...state.byKey };
    if (next.length === 0) delete byKey[key];
    else byKey[key] = next;
    return { byKey };
  });
}

/** Patches one attachment by local id wherever it lives. */
export function patchAttachment(
  id: string,
  patch: (attachment: ComposerAttachment) => ComposerAttachment,
) {
  useComposerAttachments.setState((state) => {
    // Only the list holding the attachment changes, so other drafts keep their identity.
    for (const [key, list] of Object.entries(state.byKey)) {
      const index = list.findIndex((attachment) => attachment.id === id);
      if (index === -1) continue;
      const next = [...list];
      next[index] = patch(list[index]!);
      return { byKey: { ...state.byKey, [key]: next } };
    }
    return state;
  });
}
