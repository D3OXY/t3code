import { useAtomValue } from "@effect/atom-react";
import {
  LegendList,
  type LegendListRef,
  type LegendListRenderItemProps,
  type MaintainScrollAtEndOptions,
} from "@legendapp/list/react";
import {
  resolveThreadWorkingStartedAt,
  threadRuntimeIsActive,
  type ThreadRuntimeSummary,
} from "@t3tools/client-runtime/state/shell";
import {
  deriveLatestThreadRun,
  deriveRunlessWorkStartedAt,
  deriveThreadRuntime,
} from "@t3tools/client-runtime/state/thread-execution";
import {
  shouldShowLoadEarlierControl,
  type ThreadHistoryMeta,
} from "@t3tools/client-runtime/state/threads";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { ArrowDown } from "lucide-react";
import { memo, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "~/components/ui/Button";
import { cn } from "~/lib/cn";
import { environmentThreadDetails, threadEnvironment } from "~/state/atoms";
import { commandFailureMessage, useAtomCommand } from "~/state/hooks";
import { showToast } from "~/stores/toasts";
import type { ThreadTab } from "~/stores/tabs";
import { TranscriptContext, type TranscriptContextValue } from "./context";
import { MessageRail } from "./MessageRail";
import { createTranscriptRowsBuilder, type TranscriptRow } from "./transcriptRows";
import { TranscriptRowView } from "./TranscriptRowView";
import { WorkingRow } from "./WorkingRow";
import "./transcript.css";

// Stay pinned to the end on new rows, row growth (streaming) and composer
// growth, but only while already at the end: scrolling up releases it.
const MAINTAIN_SCROLL_AT_END = {
  animated: false,
  on: { dataChange: true, itemLayout: true, layout: true, footerLayout: true },
} as const satisfies MaintainScrollAtEndOptions;
// Loading earlier turns and expanding rows above the viewport keep what you are reading still.
const MAINTAIN_VISIBLE_CONTENT = { data: true, size: true } as const;

interface ThreadActivity {
  readonly status: ThreadRuntimeSummary["status"];
  readonly startedAt: string | null;
}

/** Whether the thread is doing work, and since when. Null when it is settled. */
function threadActivity(projection: OrchestrationV2ThreadProjection): ThreadActivity | null {
  const runtime = deriveThreadRuntime(projection);
  const runlessStartedAt = deriveRunlessWorkStartedAt(projection);
  if (!threadRuntimeIsActive(runtime) && runlessStartedAt === null) return null;
  return {
    status: runtime && threadRuntimeIsActive(runtime) ? runtime.status : "running",
    startedAt:
      resolveThreadWorkingStartedAt({ latestRun: deriveLatestThreadRun(projection), runtime }) ??
      runlessStartedAt,
  };
}

/** The centered reading column every row and control sits in. */
function Column({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[46rem] px-6 @max-lg:px-4", className)}>
      {children}
    </div>
  );
}

const renderRow = ({ item }: LegendListRenderItemProps<TranscriptRow>) => (
  <Column>
    <TranscriptRowView row={item} />
  </Column>
);
const rowKey = (row: TranscriptRow) => row.id;
const rowType = (row: TranscriptRow) => (row.kind === "tools" ? "tools" : row.row.item.type);

function TranscriptHeader({
  history,
  syncError,
  onLoadEarlier,
}: {
  readonly history: ThreadHistoryMeta;
  readonly syncError: string | null;
  readonly onLoadEarlier: () => void;
}) {
  return (
    <Column className="pt-6">
      {shouldShowLoadEarlierControl(history) ? (
        <div className="flex flex-col items-center gap-1 pb-3">
          {history.hasMoreHistory ? (
            <Button size="xs" variant="ghost" disabled={history.loading} onClick={onLoadEarlier}>
              {history.loading ? "Loading earlier turns…" : "Load earlier turns"}
            </Button>
          ) : null}
          {history.error ? <p className="text-[12px] text-danger">{history.error}</p> : null}
        </div>
      ) : null}
      {syncError ? (
        <div className="mb-3 rounded-lg border border-warning/25 bg-warning/8 px-3 py-1.5 text-[12px] text-warning">
          Reconnecting to this session · {syncError}
        </div>
      ) : null}
    </Column>
  );
}

/**
 * A thread's virtualized transcript. Rows are rebuilt per projection update but
 * keep their identity unless their items changed, so streaming re-renders one
 * row. Sticks to the bottom while at the end, releases on scroll-up, and
 * re-engages when the user sends. `bottomInset` is the docked composer's height.
 */
export const Transcript = memo(function Transcript({
  threadRef,
  workspaceRoot,
  bottomInset,
}: {
  readonly threadRef: ThreadTab;
  readonly workspaceRoot: string | null;
  readonly bottomInset: number;
}) {
  const items = useAtomValue(environmentThreadDetails.visibleTurnItemsAtom(threadRef));
  const thread = useAtomValue(environmentThreadDetails.threadAtom(threadRef));
  const history = useAtomValue(environmentThreadDetails.historyAtom(threadRef));
  const syncError = useAtomValue(environmentThreadDetails.errorAtom(threadRef));
  const loadEarlier = useAtomCommand(threadEnvironment.loadEarlierHistory);

  const [buildRows] = useState(createTranscriptRowsBuilder);
  const rows = useMemo(() => buildRows(items), [buildRows, items]);
  const projection = thread?.projection ?? null;
  const activity = useMemo(
    () => (projection === null ? null : threadActivity(projection)),
    [projection],
  );
  const runtimeRequests = projection?.runtimeRequests;
  const requestsById = useMemo(
    () => new Map((runtimeRequests ?? []).map((request) => [request.id, request] as const)),
    [runtimeRequests],
  );

  // Primitives, so the footer and context only change when the activity does.
  const activityStatus = activity?.status ?? null;
  const activityStartedAt = activity?.startedAt ?? null;
  const running = activityStatus !== null;
  const lastRow = rows.at(-1);
  const trailingGroupId = lastRow?.kind === "tools" ? lastRow.id : null;
  const context = useMemo<TranscriptContextValue>(
    () => ({ threadRef, workspaceRoot, running, trailingGroupId, requestsById }),
    [threadRef, workspaceRoot, running, trailingGroupId, requestsById],
  );

  const listRef = useRef<LegendListRef | null>(null);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const atEndRef = useRef(true);
  const onScroll = () => {
    const state = listRef.current?.getState();
    if (!state) return;
    atEndRef.current = state.isWithinMaintainScrollAtEndThreshold;
    setAwayFromEnd(!state.isWithinMaintainScrollAtEndThreshold);
  };

  // The dock swaps between the composer and the taller approval/question
  // panels. When that resizes the end padding, a reader who was at the end
  // stays there instead of having the newest rows slide under the panel.
  const lastInsetRef = useRef(bottomInset);
  useEffect(() => {
    if (lastInsetRef.current === bottomInset) return;
    lastInsetRef.current = bottomInset;
    if (!atEndRef.current) return;
    // After layout, so the list scrolls to the end of the new padding.
    const frame = requestAnimationFrame(
      () => void listRef.current?.scrollToEnd({ animated: false }),
    );
    return () => cancelAnimationFrame(frame);
  }, [bottomInset]);

  // Same for the viewport itself shrinking, e.g. when the terminal opens below.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const empty = rows.length === 0 && !running && !shouldShowLoadEarlierControl(history);
  useEffect(() => {
    if (empty) return;
    const container = containerRef.current;
    if (!container) return;
    let height = container.clientHeight;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (container.clientHeight === height) return;
      height = container.clientHeight;
      if (!atEndRef.current || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        void listRef.current?.scrollToEnd({ animated: false });
      });
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [empty]);

  // Pinning to the end after new rows or a resized dock is not always reported
  // as a scroll, so re-read the end state once layout settles; otherwise the
  // "scroll to bottom" button can linger while already at the bottom.
  // `layout` names what changed; the event reads the list's current state.
  const syncEndState = useEffectEvent((_layout: string) => onScroll());
  const layout = `${rows.length}:${rows.at(-1)?.id ?? ""}:${bottomInset}`;
  useEffect(() => {
    const frame = requestAnimationFrame(() => syncEndState(layout));
    return () => cancelAnimationFrame(frame);
  }, [layout]);

  // A new prompt (the user's own send) brings the end back into view even when
  // they had scrolled up to read.
  const lastPromptId = useMemo(
    () =>
      rows.findLast((row) => row.kind === "item" && row.row.item.type === "user_message")?.id ??
      null,
    [rows],
  );
  const seenPromptId = useRef(lastPromptId);
  useEffect(() => {
    if (lastPromptId === seenPromptId.current) return;
    seenPromptId.current = lastPromptId;
    if (lastPromptId !== null) void listRef.current?.scrollToEnd({ animated: true });
  }, [lastPromptId]);

  const onLoadEarlier = () => {
    void loadEarlier({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId },
    }).then((result) => {
      const message = commandFailureMessage(result);
      if (message) showToast(message);
    });
  };

  const header = (
    <TranscriptHeader history={history} syncError={syncError} onLoadEarlier={onLoadEarlier} />
  );
  const footer = (
    <Column>
      {activityStatus !== null ? (
        <div className="pt-1">
          <WorkingRow
            status={activityStatus}
            startedAt={activityStartedAt}
            seed={`${threadRef.threadId}:${activityStartedAt}`}
          />
        </div>
      ) : null}
      <div style={{ height: bottomInset + 24 }} aria-hidden />
    </Column>
  );

  if (empty) {
    return (
      <div
        className="grid h-full place-items-center text-[13px] text-faint"
        style={{ paddingBottom: bottomInset }}
      >
        Nothing here yet. Send a message to get started.
      </div>
    );
  }

  return (
    <TranscriptContext value={context}>
      <div ref={containerRef} className="@container relative h-full min-h-0">
        <LegendList<TranscriptRow>
          ref={listRef}
          data={rows}
          keyExtractor={rowKey}
          getItemType={rowType}
          renderItem={renderRow}
          estimatedItemSize={88}
          initialScrollAtEnd
          maintainScrollAtEnd={MAINTAIN_SCROLL_AT_END}
          maintainScrollAtEndThreshold={0.1}
          maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT}
          onScroll={onScroll}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          className="h-full overflow-x-hidden overscroll-y-contain [overflow-anchor:none]"
        />
        <MessageRail rows={rows} listRef={listRef} />
        {awayFromEnd ? (
          <button
            type="button"
            aria-label="Scroll to bottom"
            onClick={() => void listRef.current?.scrollToEnd({ animated: true })}
            className="glass-pop animate-fade-quick absolute left-1/2 z-10 grid size-8 -translate-x-1/2 place-items-center rounded-full text-muted transition-colors outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/60"
            style={{ bottom: bottomInset + 12 }}
          >
            <ArrowDown className="size-4" />
          </button>
        ) : null}
      </div>
    </TranscriptContext>
  );
});
