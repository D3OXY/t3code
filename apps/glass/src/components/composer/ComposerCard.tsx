import { useAtomValue } from "@effect/atom-react";
import {
  connectionStatusTitle,
  type EnvironmentPresentation,
} from "@t3tools/client-runtime/connection";
import { resolveComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import type { EnvironmentId } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import {
  AlertCircle,
  ArrowUp,
  CornerDownRight,
  ListPlus,
  Paperclip,
  Square,
  WifiOff,
  X,
} from "lucide-react";
import {
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { Button } from "~/components/ui/Button";
import { Tooltip } from "~/components/ui/Tooltip";
import { WorkingCells } from "~/components/ui/WorkingCells";
import { cn } from "~/lib/cn";
import { isMac, shortcutLabel } from "~/lib/format";
import { environmentPresentations } from "~/state/atoms";
import {
  readDraft,
  readDraftAttachments,
  useDraftAttachments,
  useDrafts,
  type ComposerAttachment,
} from "~/stores/drafts";
import { AttachmentStrip } from "./AttachmentStrip";
import { addComposerFiles, releaseSentAttachments } from "./attachments";

const MIN_HEIGHT = 76;
const MAX_HEIGHT = 260;
const SAVE_DELAY_MS = 300;
const NO_IDS: ReadonlySet<string> = new Set();
const NO_PRESENTATION = Atom.make<EnvironmentPresentation | null>(null);

export interface ComposerSubmission {
  readonly text: string;
  readonly attachments: ReadonlyArray<ComposerAttachment>;
  /** Mod+Enter: the alternate follow-up (steer instead of queue, or vice versa). */
  readonly alternate: boolean;
}

/** One cheap layout read per input: grow with content between the min and max height. */
function fitHeight(textarea: HTMLTextAreaElement) {
  textarea.style.height = "auto";
  const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, textarea.scrollHeight));
  textarea.style.height = `${height}px`;
  textarea.style.overflowY = textarea.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
}

/** Sets the prompt's text from code (draft swaps, restores) and refits its height. */
function replaceText(textarea: HTMLTextAreaElement, value: string) {
  textarea.value = value;
  fitHeight(textarea);
}

/**
 * The frosted prompt card shared by the new-session canvas and threads. It
 * owns typing, attachments, notices and the send button; callers own what a
 * send means. The textarea is uncontrolled and never remounts: switching
 * `draftKey` swaps its contents, and text is saved to the draft store on a
 * short debounce rather than per keystroke.
 *
 * `onSubmit` resolves to an error message (the text and attachments are put
 * back) or null on success.
 */
export function ComposerCard({
  draftKey,
  environmentId,
  running = false,
  canStop = false,
  followUpBehavior = "queue",
  blockedReason = null,
  autoFocus = false,
  placeholder = "Do anything…",
  controls,
  onSubmit,
  onStop,
}: {
  readonly draftKey: string;
  readonly environmentId: EnvironmentId | null;
  /** A turn is in flight, so a send queues or steers. */
  readonly running?: boolean;
  readonly canStop?: boolean;
  readonly followUpBehavior?: "queue" | "steer";
  /** Why sending is impossible right now (no project, no model…), shown on attempt. */
  readonly blockedReason?: string | null;
  readonly autoFocus?: boolean;
  readonly placeholder?: string;
  /** Footer controls (model picker, mode menu) placed before the send button. */
  readonly controls?: ReactNode;
  readonly onSubmit: (submission: ComposerSubmission) => Promise<string | null>;
  readonly onStop?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedKeyRef = useRef(draftKey);
  const saveTimerRef = useRef<number | null>(null);
  const sendingRef = useRef(false);
  const dragDepthRef = useRef(0);
  const [hasText, setHasText] = useState(() => readDraft(draftKey).text.trim() !== "");
  const [sendingIds, setSendingIds] = useState<ReadonlySet<string>>(NO_IDS);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [modHeld, setModHeld] = useState(false);
  const attachments = useDraftAttachments(draftKey);
  const presentation = useAtomValue(
    environmentId === null
      ? NO_PRESENTATION
      : environmentPresentations.presentationAtom(environmentId),
  );
  const disconnected = presentation !== null && presentation.connection.phase !== "connected";

  const flushText = () => {
    if (saveTimerRef.current === null) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const textarea = textareaRef.current;
    if (textarea) useDrafts.getState().update(loadedKeyRef.current, { text: textarea.value });
  };

  // A different draft resets the per-draft UI state during render.
  const [stateKey, setStateKey] = useState(draftKey);
  if (stateKey !== draftKey) {
    setStateKey(draftKey);
    setHasText(readDraft(draftKey).text.trim() !== "");
    setError(null);
  }

  // Swap the textarea's contents when the draft changes, saving the old draft first.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    loadedKeyRef.current = draftKey;
    replaceText(textarea, readDraft(draftKey).text);
    if (autoFocus) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    return () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      useDrafts.getState().update(draftKey, { text: textarea.value });
    };
  }, [draftKey, autoFocus]);

  // Preview the alternate follow-up while Mod is held during a running turn.
  useEffect(() => {
    if (!running) return;
    const sync = (event: globalThis.KeyboardEvent) =>
      setModHeld(isMac ? event.metaKey : event.ctrlKey);
    const clear = () => setModHeld(false);
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", sync);
      window.removeEventListener("keyup", sync);
      window.removeEventListener("blur", clear);
    };
  }, [running]);

  const pendingAttachments = attachments.filter((attachment) => !sendingIds.has(attachment.id));
  const hasContent = hasText || pendingAttachments.length > 0;
  const dispatch = resolveComposerDispatchMode({
    running,
    alternateModifier: running && modHeld,
    activeTurnDefault: followUpBehavior,
  });
  const intent =
    running && !hasContent && canStop
      ? "stop"
      : running
        ? dispatch === "steer"
          ? "steer"
          : "queue"
        : "send";
  const alternate = followUpBehavior === "queue" ? "Steer" : "Queue";

  const addFiles = async (files: ReadonlyArray<File>) => {
    if (files.length === 0) return;
    const message = await addComposerFiles(draftKey, environmentId, files);
    setError(message);
  };

  const submit = async (alternateModifier: boolean) => {
    const textarea = textareaRef.current;
    if (!textarea || sendingRef.current) return;
    const key = draftKey;
    const text = textarea.value.trim();
    const outgoing = readDraftAttachments(key);
    if (text === "" && outgoing.length === 0) {
      if (running && canStop) onStop?.();
      return;
    }
    if (blockedReason) {
      setError(blockedReason);
      return;
    }
    if (disconnected) return;
    if (outgoing.some((attachment) => attachment.upload.status === "failed")) {
      setError("Retry or remove the attachments that failed to upload.");
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setError(null);
    setSendingIds(new Set(outgoing.map((attachment) => attachment.id)));
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    replaceText(textarea, "");
    setHasText(false);
    useDrafts.getState().update(key, { text: "" });

    const failure = await onSubmit({ text, attachments: outgoing, alternate: alternateModifier });

    sendingRef.current = false;
    setSending(false);
    setSendingIds(NO_IDS);
    if (failure === null) {
      releaseSentAttachments(key, outgoing);
      return;
    }
    // Put the prompt back, ahead of anything typed while it was sending.
    if (text !== "") {
      const live = loadedKeyRef.current === key ? textareaRef.current : null;
      const current = live ? live.value : readDraft(key).text;
      const restored = current.trim() === "" ? text : `${text}\n\n${current}`;
      if (live) {
        replaceText(live, restored);
        setHasText(true);
      }
      useDrafts.getState().update(key, { text: restored });
    }
    setError(failure);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey) return;
    // IME composition (and Safari's trailing keydown after it) must not send.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    void submit(isMac ? event.metaKey : event.ctrlKey);
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    void addFiles(files);
  };

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

  return (
    <div
      className="relative"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepthRef.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepthRef.current = 0;
        setDragging(false);
        void addFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="glass overflow-hidden rounded-2xl border border-line shadow-[0_12px_40px_-16px_rgb(0_0_0/0.35)] transition-[border-color] duration-150 focus-within:border-line-strong">
        {error ? (
          <div role="alert" className="flex items-start gap-2 px-4 pt-3 text-[12.5px] text-danger">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 break-words">{error}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setError(null)}
              className="text-danger/70 outline-none hover:text-danger"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {disconnected && presentation ? (
          <div
            role="status"
            className="flex items-center gap-2 px-4 pt-3 text-[12.5px] text-warning"
          >
            <WifiOff className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {presentation.entry.target.label}: {connectionStatusTitle(presentation.connection)}{" "}
              Sending resumes once it reconnects.
            </span>
          </div>
        ) : null}
        <AttachmentStrip draftKey={draftKey} attachments={attachments} sendingIds={sendingIds} />
        <textarea
          ref={textareaRef}
          rows={1}
          aria-label="Message"
          placeholder={placeholder}
          spellCheck
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onInput={(event) => {
            const textarea = event.currentTarget;
            fitHeight(textarea);
            setHasText(textarea.value.trim() !== "");
            if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
            saveTimerRef.current = window.setTimeout(flushText, SAVE_DELAY_MS);
          }}
          onBlur={flushText}
          style={{ height: MIN_HEIGHT }}
          className="block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[14px] leading-relaxed text-fg outline-none placeholder:text-faint"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              void addFiles(files);
            }}
          />
          <Tooltip label="Attach files" side="top">
            <Button
              size="icon"
              variant="ghost"
              aria-label="Attach files"
              disabled={environmentId === null}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>
          </Tooltip>
          {sending ? (
            <span className="animate-fade-quick px-1 text-[12px] text-faint">Sending…</span>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center justify-end gap-0.5">{controls}</div>
          <SendButton
            intent={intent}
            sending={sending}
            disabled={disconnected || (intent !== "stop" && !hasContent)}
            blockedReason={blockedReason}
            alternateLabel={alternate}
            onClick={() => (intent === "stop" ? onStop?.() : void submit(false))}
          />
        </div>
      </div>
      {dragging ? (
        <div className="animate-fade-quick pointer-events-none absolute inset-0 grid place-items-center rounded-2xl border-2 border-dashed border-accent/70 bg-accent/10 text-[13px] font-medium text-accent">
          Drop to attach
        </div>
      ) : null}
    </div>
  );
}

function SendButton({
  intent,
  sending,
  disabled,
  blockedReason,
  alternateLabel,
  onClick,
}: {
  readonly intent: "send" | "queue" | "steer" | "stop";
  readonly sending: boolean;
  readonly disabled: boolean;
  readonly blockedReason: string | null;
  readonly alternateLabel: string;
  readonly onClick: () => void;
}) {
  if (intent === "stop") {
    return (
      <Tooltip label="Stop" side="top">
        <Button size="icon-lg" variant="primary" aria-label="Stop" onClick={onClick}>
          <Square className="size-3 fill-current" />
        </Button>
      </Tooltip>
    );
  }
  if (intent === "queue" || intent === "steer") {
    const Icon = intent === "queue" ? ListPlus : CornerDownRight;
    return (
      <Tooltip label={`${alternateLabel} instead`} shortcut={shortcutLabel("mod+enter")} side="top">
        <Button
          size="sm"
          variant="primary"
          disabled={disabled || sending}
          onClick={onClick}
          aria-label={intent === "queue" ? "Queue message" : "Steer the agent"}
        >
          <Icon className="size-3.5" />
          {intent === "queue" ? "Queue" : "Steer"}
        </Button>
      </Tooltip>
    );
  }
  return (
    <Tooltip label={blockedReason ?? "Send"} shortcut={blockedReason ? undefined : "↵"} side="top">
      <span className={cn(blockedReason !== null && "cursor-not-allowed")}>
        <Button
          size="icon-lg"
          variant="primary"
          aria-label="Send"
          disabled={disabled || sending || blockedReason !== null}
          onClick={onClick}
        >
          {sending ? <WorkingCells size="xs" /> : <ArrowUp className="size-4" />}
        </Button>
      </span>
    </Tooltip>
  );
}
