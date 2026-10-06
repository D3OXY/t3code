import { useAtomValue } from "@effect/atom-react";
import { parseThreadKey, threadKey } from "@t3tools/client-runtime/state/entities";
import { useNavigate } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { Plus } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { ThreadComposer } from "~/components/composer/ThreadComposer";
import { DiffPane } from "~/components/diff/DiffPane";
import { TerminalPanel } from "~/components/terminal/TerminalPanel";
import { Transcript } from "~/components/transcript/Transcript";
import { useMarkThreadSeen } from "~/components/transcript/useMarkThreadSeen";
import { Button } from "~/components/ui/Button";
import { cn } from "~/lib/cn";
import { useActiveThreadRef } from "~/lib/navigation";
import {
  environmentProjects,
  environmentThreadDetails,
  environmentThreadShells,
} from "~/state/atoms";
import {
  SIDE_PANE_DEFAULT_WIDTH,
  SIDE_PANE_MAX_WIDTH,
  SIDE_PANE_MIN_WIDTH,
  useLayout,
} from "~/stores/layout";
import type { ThreadTab } from "~/stores/tabs";

/** What the route can show for a thread: its transcript, or why it cannot. */
const threadPresenceAtom = Atom.family((key: string) =>
  Atom.make((get): "ready" | "deleted" | "error" | "loading" => {
    const state = get(environmentThreadDetails.stateAtom(parseThreadKey(key)));
    if (Option.isSome(state.data)) return "ready";
    if (state.status === "deleted") return "deleted";
    return Option.isSome(state.error) ? "error" : "loading";
  }).pipe(Atom.withLabel(`glass-thread-presence:${key}`)),
);

/** The directory file paths in the transcript are shown relative to. */
const workspaceRootAtom = Atom.family((key: string) =>
  Atom.make((get): string | null => {
    const ref = parseThreadKey(key);
    const worktreePath = get(environmentThreadDetails.worktreePathAtom(ref));
    if (worktreePath) return worktreePath;
    const shell = get(environmentThreadShells.threadShellAtom(ref));
    if (shell === null) return null;
    return (
      get(
        environmentProjects.projectAtom({
          environmentId: ref.environmentId,
          projectId: shell.projectId,
        }),
      )?.workspaceRoot ?? null
    );
  }).pipe(Atom.withLabel(`glass-thread-workspace-root:${key}`)),
);

const SIDE_PANE_TRANSITION_MS = 200;

export function ThreadRoute() {
  const threadRef = useActiveThreadRef();
  if (threadRef === null) return null;
  // Keyed so switching threads starts a fresh list scrolled to its end.
  return <ThreadView key={threadKey(threadRef)} threadRef={threadRef} />;
}

/**
 * A thread: transcript with the composer docked over its bottom edge, the
 * terminal drawer under both, and the resizable changes pane on the right.
 */
function ThreadView({ threadRef }: { readonly threadRef: ThreadTab }) {
  const presence = useAtomValue(threadPresenceAtom(threadKey(threadRef)));
  const diffOpen = useLayout((state) => state.diffOpen);
  const terminalOpen = useLayout((state) => state.terminalOpen);
  const ready = presence === "ready";

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <SeenTracker threadRef={threadRef} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {ready ? (
          <ThreadBody threadRef={threadRef} />
        ) : presence === "deleted" ? (
          <MissingThread />
        ) : presence === "error" ? (
          <ThreadError threadRef={threadRef} />
        ) : (
          <TranscriptSkeleton />
        )}
        {terminalOpen && ready ? <TerminalPanel threadRef={threadRef} /> : null}
      </div>
      <SidePane open={diffOpen && ready}>
        <DiffPane threadRef={threadRef} />
      </SidePane>
    </div>
  );
}

/** Hosts the visit tracking, so shell updates re-render nothing else. */
function SeenTracker({ threadRef }: { readonly threadRef: ThreadTab }) {
  useMarkThreadSeen(threadRef);
  return null;
}

function ThreadBody({ threadRef }: { readonly threadRef: ThreadTab }) {
  const workspaceRoot = useAtomValue(workspaceRootAtom(threadKey(threadRef)));
  const dockRef = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);

  // The transcript pads its end by the dock's height so the last message
  // clears the composer, and follows it as the composer grows.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    setDockHeight(dock.offsetHeight);
    const observer = new ResizeObserver(() => setDockHeight(dock.offsetHeight));
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative min-h-0 flex-1">
      <Transcript threadRef={threadRef} workspaceRoot={workspaceRoot} bottomInset={dockHeight} />
      <div
        ref={dockRef}
        className="transcript-composer-fade pointer-events-none absolute inset-x-0 bottom-0 z-20 pt-6"
      >
        <div className="pointer-events-auto mx-auto w-full max-w-[46rem] px-4 pb-3">
          <ThreadComposer threadRef={threadRef} />
        </div>
      </div>
    </div>
  );
}

const clampPane = (width: number) =>
  Math.min(SIDE_PANE_MAX_WIDTH, Math.max(SIDE_PANE_MIN_WIDTH, width));

/**
 * The right-hand pane. Width animates when toggled (content keeps its width so
 * it slides rather than reflows) and follows the drag handle on its left edge.
 * A drag previews locally and persists once on release.
 */
function SidePane({ open, children }: { readonly open: boolean; readonly children: ReactNode }) {
  const width = useLayout((state) => state.sidePaneWidth);
  const setWidth = useLayout((state) => state.setSidePaneWidth);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  // Keep the content mounted until the closing transition has finished.
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setMounted(false), SIDE_PANE_TRANSITION_MS + 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  const shown = dragWidth ?? width;
  const drag = useRef<{ readonly startX: number; readonly startWidth: number } | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: shown };
    setDragWidth(shown);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setDragWidth(clampPane(drag.current.startWidth + drag.current.startX - event.clientX));
  };
  const onPointerEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    if (dragWidth !== null) setWidth(dragWidth);
    setDragWidth(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 64 : 16;
    if (event.key === "ArrowLeft") setWidth(width + step);
    else if (event.key === "ArrowRight") setWidth(width - step);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden",
        dragWidth === null &&
          "transition-[width] duration-200 ease-[var(--ease-glide)] motion-reduce:transition-none",
      )}
      style={{ width: open ? shown : 0 }}
      inert={!open}
    >
      {mounted ? (
        <div
          className="absolute inset-y-0 right-0 flex border-l border-line"
          style={{ width: shown }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize changes pane"
            aria-valuenow={shown}
            aria-valuemin={SIDE_PANE_MIN_WIDTH}
            aria-valuemax={SIDE_PANE_MAX_WIDTH}
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onDoubleClick={() => setWidth(SIDE_PANE_DEFAULT_WIDTH)}
            onKeyDown={onKeyDown}
            className="group/resize absolute inset-y-0 left-0 z-10 w-2 cursor-col-resize touch-none outline-none"
          >
            <div
              className={cn(
                "h-full w-px transition-colors duration-150 group-hover/resize:bg-line-strong group-focus-visible/resize:bg-accent",
                dragWidth !== null && "bg-accent",
              )}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function CenteredState({ children }: { readonly children: ReactNode }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6">
      <div className="animate-fade-in flex max-w-sm flex-col items-center gap-2 text-center">
        {children}
      </div>
    </div>
  );
}

function MissingThread() {
  const navigate = useNavigate();
  return (
    <CenteredState>
      <p className="text-[15px] font-medium">This session no longer exists</p>
      <p className="text-[13px] text-muted">
        It may have been deleted, possibly from another device.
      </p>
      <Button variant="secondary" className="mt-2" onClick={() => void navigate({ to: "/" })}>
        <Plus className="size-3.5" />
        Start a new session
      </Button>
    </CenteredState>
  );
}

function ThreadError({ threadRef }: { readonly threadRef: ThreadTab }) {
  const error = useAtomValue(environmentThreadDetails.errorAtom(threadRef));
  const navigate = useNavigate();
  return (
    <CenteredState>
      <p className="text-[15px] font-medium">Couldn’t load this session</p>
      {error ? <p className="text-[13px] break-words text-muted">{error}</p> : null}
      <p className="text-[12px] text-faint">Retrying automatically.</p>
      <Button variant="ghost" size="sm" className="mt-1" onClick={() => void navigate({ to: "/" })}>
        Back to new session
      </Button>
    </CenteredState>
  );
}

/** A quiet static placeholder; it only appears if loading takes a beat. */
function TranscriptSkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden" aria-busy="true" aria-label="Loading session">
      <div className="animate-fade-in mx-auto flex w-full max-w-[46rem] flex-col gap-3 px-6 pt-10 [animation-delay:180ms]">
        <div className="ml-auto h-9 w-2/5 rounded-2xl bg-hover" />
        <div className="mt-3 h-3 w-11/12 rounded bg-hover" />
        <div className="h-3 w-4/5 rounded bg-hover" />
        <div className="h-3 w-3/5 rounded bg-hover" />
        <div className="mt-2 h-3 w-1/3 rounded bg-hover" />
        <div className="mt-6 ml-auto h-9 w-1/3 rounded-2xl bg-hover" />
        <div className="mt-3 h-3 w-10/12 rounded bg-hover" />
        <div className="h-3 w-2/3 rounded bg-hover" />
      </div>
    </div>
  );
}
