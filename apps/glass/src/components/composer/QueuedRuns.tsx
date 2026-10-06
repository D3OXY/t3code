import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import type { ThreadQueueWorkflowState } from "@t3tools/client-runtime/state/thread-workflows";
import type { EnvironmentId, RunId, ThreadId } from "@t3tools/contracts";
import { GripVertical, Pause, Pencil, Trash2 } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";

import { Button } from "~/components/ui/Button";
import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import { threadEnvironment } from "~/state/atoms";
import { commandFailureMessage, useAtomCommand } from "~/state/hooks";
import { showToast } from "~/stores/toasts";

type QueuedRun = ThreadQueueWorkflowState["queuedRuns"][number];

/**
 * Messages waiting behind the running turn, docked above the composer: edit
 * in place, delete, send now (steer), drag to reorder, and resume a held queue.
 */
export function QueuedRuns({
  environmentId,
  threadId,
  workflow,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly workflow: ThreadQueueWorkflowState;
}) {
  const reorder = useAtomCommand(threadEnvironment.reorderQueuedRun);
  const promote = useAtomCommand(threadEnvironment.promoteQueuedRun);
  const cancel = useAtomCommand(threadEnvironment.cancelQueuedRun);
  const edit = useAtomCommand(threadEnvironment.editQueuedRun);
  const resume = useAtomCommand(threadEnvironment.resumeThreadQueue);
  const [busyRunId, setBusyRunId] = useState<RunId | null>(null);
  const [editingRunId, setEditingRunId] = useState<RunId | null>(null);
  const [resuming, setResuming] = useState(false);
  const [drag, setDrag] = useState<{
    readonly runId: RunId;
    readonly insertIndex: number | null;
  } | null>(null);
  const armedRunIdRef = useRef<RunId | null>(null);
  const { queuedRuns, activeRun, canReorder, canPromoteToSteer, isHeld } = workflow;

  const run = async (runId: RunId, action: () => Promise<AtomCommandResult<unknown, unknown>>) => {
    setBusyRunId(runId);
    const message = commandFailureMessage(await action());
    setBusyRunId(null);
    if (message) showToast(message);
    return message === null;
  };

  const completeDrag = (runId: RunId, insertIndex: number | null) => {
    setDrag(null);
    armedRunIdRef.current = null;
    if (insertIndex === null || busyRunId !== null) return;
    const from = queuedRuns.findIndex((entry) => entry.run.id === runId);
    // Dropping right before or after itself is a no-op.
    if (from === -1 || insertIndex === from || insertIndex === from + 1) return;
    void run(runId, () =>
      reorder({
        environmentId,
        input: { threadId, runId, beforeRunId: queuedRuns[insertIndex]?.run.id ?? null },
      }),
    );
  };

  if (queuedRuns.length === 0) return null;

  return (
    <div
      role="region"
      aria-label={`${queuedRuns.length} queued ${queuedRuns.length === 1 ? "message" : "messages"}`}
      className="glass animate-fade-in mx-3 overflow-hidden rounded-t-xl border border-b-0 border-line"
    >
      {isHeld ? (
        <div className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-[12px] text-warning">
          <Pause className="size-3.5" />
          <span className="flex-1">Queue paused</span>
          <Button
            size="xs"
            variant="secondary"
            disabled={resuming}
            onClick={async () => {
              setResuming(true);
              const message = commandFailureMessage(
                await resume({ environmentId, input: { threadId } }),
              );
              setResuming(false);
              if (message) showToast(message);
            }}
          >
            Resume queue
          </Button>
        </div>
      ) : null}
      <ol
        className="max-h-48 overflow-y-auto py-1"
        onDragOver={(event) => {
          if (!drag) return;
          event.preventDefault();
          const rows = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>("[data-queue-row]"),
          );
          const insertIndex = rows.findIndex((row) => {
            const rect = row.getBoundingClientRect();
            return event.clientY < rect.top + rect.height / 2;
          });
          const next = insertIndex === -1 ? rows.length : insertIndex;
          if (next !== drag.insertIndex) setDrag({ ...drag, insertIndex: next });
        }}
        onDrop={(event) => {
          if (!drag) return;
          event.preventDefault();
          completeDrag(drag.runId, drag.insertIndex);
        }}
      >
        {queuedRuns.map((entry, index) => (
          <QueuedRow
            key={entry.run.id}
            entry={entry}
            busy={busyRunId === entry.run.id}
            editing={editingRunId === entry.run.id}
            dragging={drag?.runId === entry.run.id}
            insertBefore={drag !== null && drag.insertIndex === index}
            insertAfter={
              drag !== null &&
              index === queuedRuns.length - 1 &&
              drag.insertIndex === queuedRuns.length
            }
            canReorder={canReorder && queuedRuns.length > 1}
            canSendNow={canPromoteToSteer && activeRun !== null}
            onArm={() => {
              armedRunIdRef.current = entry.run.id;
            }}
            onDragStart={(event) => {
              if (armedRunIdRef.current !== entry.run.id) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", entry.text);
              setDrag({ runId: entry.run.id, insertIndex: null });
            }}
            onDragEnd={() => {
              setDrag(null);
              armedRunIdRef.current = null;
            }}
            onEdit={() => setEditingRunId(entry.run.id)}
            onCancelEdit={() => setEditingRunId(null)}
            onSave={async (text) => {
              const ok = await run(entry.run.id, () =>
                edit({ environmentId, input: { threadId, runId: entry.run.id, text } }),
              );
              if (ok) setEditingRunId(null);
            }}
            onDelete={() =>
              void run(entry.run.id, () =>
                cancel({ environmentId, input: { threadId, runId: entry.run.id } }),
              )
            }
            onSendNow={() => {
              if (!activeRun) return;
              void run(entry.run.id, () =>
                promote({
                  environmentId,
                  input: { threadId, queuedRunId: entry.run.id, targetRunId: activeRun.id },
                }),
              );
            }}
          />
        ))}
      </ol>
    </div>
  );
}

function QueuedRow({
  entry,
  busy,
  editing,
  dragging,
  insertBefore,
  insertAfter,
  canReorder,
  canSendNow,
  onArm,
  onDragStart,
  onDragEnd,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onSendNow,
}: {
  readonly entry: QueuedRun;
  readonly busy: boolean;
  readonly editing: boolean;
  readonly dragging: boolean;
  readonly insertBefore: boolean;
  readonly insertAfter: boolean;
  readonly canReorder: boolean;
  readonly canSendNow: boolean;
  readonly onArm: () => void;
  readonly onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  readonly onDragEnd: () => void;
  readonly onEdit: () => void;
  readonly onCancelEdit: () => void;
  readonly onSave: (text: string) => Promise<void>;
  readonly onDelete: () => void;
  readonly onSendNow: () => void;
}) {
  const [text, setText] = useState(entry.text);
  const attachmentNames = entry.attachments.map((attachment) => attachment.name);

  return (
    <li
      data-queue-row
      draggable={canReorder && !editing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative flex items-start gap-1.5 px-2 py-1 transition-opacity duration-150",
        (dragging || busy) && "opacity-50",
      )}
    >
      {insertBefore ? (
        <span className="absolute inset-x-3 -top-px h-0.5 rounded-full bg-accent" />
      ) : null}
      {insertAfter ? (
        <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent" />
      ) : null}
      {canReorder ? (
        <span
          aria-hidden
          onPointerDown={onArm}
          className="mt-1 grid h-6 w-4 shrink-0 cursor-grab place-items-center text-faint hover:text-muted active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </span>
      ) : (
        <span className="w-1" />
      )}
      {editing ? (
        <form
          className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim() !== "") void onSave(text.trim());
          }}
        >
          <textarea
            autoFocus
            value={text}
            rows={Math.min(6, Math.max(1, text.split("\n").length))}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setText(entry.text);
                onCancelEdit();
              } else if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            aria-label="Edit queued message"
            className="w-full resize-none rounded-lg border border-line-strong bg-transparent px-2 py-1 text-[13px] outline-none"
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setText(entry.text);
                onCancelEdit();
              }}
            >
              Cancel
            </Button>
            <Button size="xs" variant="primary" type="submit" disabled={busy || text.trim() === ""}>
              Save
            </Button>
          </div>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1 py-1">
            <div className="truncate text-[13px]">{entry.text}</div>
            {attachmentNames.length > 0 ? (
              <div className="truncate text-[11.5px] text-faint">
                {attachmentNames.length}{" "}
                {attachmentNames.length === 1 ? "attachment" : "attachments"} ·{" "}
                {attachmentNames.join(" · ")}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Tooltip label="Delete" side="top">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete queued message"
                disabled={busy}
                onClick={onDelete}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </Tooltip>
            <Tooltip label="Edit" side="top">
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Edit queued message"
                disabled={busy}
                onClick={() => {
                  setText(entry.text);
                  onEdit();
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            </Tooltip>
            {canSendNow ? (
              <Button size="xs" variant="ghost" disabled={busy} onClick={onSendNow}>
                Send now
              </Button>
            ) : null}
          </div>
        </>
      )}
    </li>
  );
}
