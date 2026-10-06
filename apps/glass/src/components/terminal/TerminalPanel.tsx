import type { TerminalSummary } from "@t3tools/contracts";
import { resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";
import { Plus, SquareTerminal, X } from "lucide-react";
import { useEffect, useMemo } from "react";

import { Button } from "~/components/ui/Button";
import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import { basename, shortcutLabel } from "~/lib/format";
import { SHORTCUTS } from "~/lib/shortcuts";
import { terminalEnvironment } from "~/state/atoms";
import { useAtomCommand, useEnvironmentQuery } from "~/state/hooks";
import { confirmAction } from "~/stores/confirm";
import { useLayout } from "~/stores/layout";
import type { ThreadTab } from "~/stores/tabs";
import { TerminalView } from "./TerminalView";
import { useTerminalTabs, visibleTerminalIds } from "./terminalTabs";
import { useThreadCwd } from "./useThreadCwd";

const DEFAULT_HEIGHT = 280;
const NO_SUMMARIES: ReadonlyArray<TerminalSummary> = [];

/** The bottom terminal drawer for a thread's working directory. */
export function TerminalPanel({ threadRef }: { readonly threadRef: ThreadTab }) {
  const height = useLayout((state) => state.terminalHeight);
  const setHeight = useLayout((state) => state.setTerminalHeight);
  const toggleTerminal = useLayout((state) => state.toggleTerminal);
  const { cwd, worktreePath } = useThreadCwd(threadRef);
  const threadKey = `${threadRef.environmentId}:${threadRef.threadId}`;
  const local = useTerminalTabs((state) => state.byThread[threadKey]);
  const createTab = useTerminalTabs((state) => state.create);
  const closeTab = useTerminalTabs((state) => state.close);
  const setActiveTab = useTerminalTabs((state) => state.setActive);
  const pruneClosed = useTerminalTabs((state) => state.pruneClosed);
  const runClose = useAtomCommand(terminalEnvironment.close);

  const metadata = useEnvironmentQuery(
    terminalEnvironment.metadata({ environmentId: threadRef.environmentId, input: null }),
  );
  const summaries = useMemo(
    () =>
      metadata.data?.filter((summary) => summary.threadId === threadRef.threadId) ?? NO_SUMMARIES,
    [metadata.data, threadRef.threadId],
  );
  const serverIds = useMemo(() => summaries.map((summary) => summary.terminalId), [summaries]);
  const visible = visibleTerminalIds(serverIds, local);
  const active =
    local?.active && visible.includes(local.active) ? local.active : (visible[0] ?? "");
  const activeSummary = summaries.find((summary) => summary.terminalId === active) ?? null;

  useEffect(() => {
    if (metadata.data !== null) pruneClosed(threadKey, serverIds);
  }, [metadata.data, pruneClosed, serverIds, threadKey]);

  const closeTerminal = async (terminalId: string) => {
    const summary = summaries.find((candidate) => candidate.terminalId === terminalId);
    if (summary?.hasRunningSubprocess) {
      const confirmed = await confirmAction({
        title: "Close terminal?",
        description: `A process is still running in ${resolveTerminalSessionLabel(terminalId, summary)}. Closing the terminal ends it.`,
        confirmLabel: "Close terminal",
        danger: true,
      });
      if (!confirmed) return;
    }
    const remaining = closeTab(threadKey, terminalId, visible);
    void runClose({
      environmentId: threadRef.environmentId,
      input: { threadId: threadRef.threadId, terminalId, deleteHistory: true },
    });
    if (remaining.length === 0) toggleTerminal(false);
  };

  return (
    <section
      aria-label="Terminal"
      className="relative flex shrink-0 flex-col border-t border-line"
      style={{ height: `min(${height}px, 55vh)` }}
    >
      <ResizeHandle height={height} onResize={setHeight} />
      <div className="flex h-9 shrink-0 items-center gap-1 pr-2 pl-2">
        <div
          role="tablist"
          className="no-scrollbar flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        >
          {visible.map((terminalId) => {
            const summary =
              summaries.find((candidate) => candidate.terminalId === terminalId) ?? null;
            const selected = terminalId === active;
            return (
              <div
                key={terminalId}
                className={cn(
                  "group flex h-7 shrink-0 items-center rounded-lg text-[12px] transition-colors duration-150",
                  selected ? "bg-active text-fg" : "text-muted hover:bg-hover hover:text-fg",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(threadKey, terminalId)}
                  className="flex h-full max-w-48 items-center gap-1.5 pl-2.5 outline-none"
                >
                  <SquareTerminal className="size-3.5 shrink-0 opacity-70" />
                  <span className="truncate">
                    {resolveTerminalSessionLabel(terminalId, summary)}
                  </span>
                  {summary?.hasRunningSubprocess ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-accent"
                      aria-label="Running"
                    />
                  ) : summary?.status === "exited" ? (
                    <span className="shrink-0 text-[10.5px] text-faint">exited</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label={`Close ${resolveTerminalSessionLabel(terminalId, summary)}`}
                  onClick={() => void closeTerminal(terminalId)}
                  className={cn(
                    "mr-1 ml-0.5 grid size-5 place-items-center rounded-md text-faint outline-none hover:bg-hover hover:text-fg focus-visible:opacity-100",
                    selected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                  )}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
          <Tooltip label="New terminal">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="New terminal"
              onClick={() => createTab(threadKey, visible)}
            >
              <Plus className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
        {cwd ? (
          <span className="max-w-56 shrink truncate font-mono text-[11px] text-faint">
            {basename(cwd)}
          </span>
        ) : null}
        <Tooltip label="Hide terminal" shortcut={shortcutLabel(SHORTCUTS.toggleTerminal)}>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Hide terminal"
            onClick={() => toggleTerminal(false)}
          >
            <X className="size-3.5" />
          </Button>
        </Tooltip>
      </div>
      {cwd === null ? (
        <div className="grid flex-1 place-items-center text-[12.5px] text-faint">
          Resolving working directory…
        </div>
      ) : (
        <TerminalView
          key={`${active}:${cwd}`}
          environmentId={threadRef.environmentId}
          threadId={threadRef.threadId}
          terminalId={active}
          cwd={cwd}
          worktreePath={worktreePath}
          exitCode={activeSummary?.exitCode ?? null}
        />
      )}
    </section>
  );
}

/** Top-edge drag handle; double-click restores the default height. */
function ResizeHandle({
  height,
  onResize,
}: {
  readonly height: number;
  readonly onResize: (height: number) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize terminal"
      tabIndex={0}
      className="absolute inset-x-0 -top-1 z-10 h-2 cursor-row-resize outline-none focus-visible:bg-accent/40"
      onDoubleClick={() => onResize(DEFAULT_HEIGHT)}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") onResize(height + 16);
        if (event.key === "ArrowDown") onResize(height - 16);
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        const startY = event.clientY;
        // Measure the rendered height: the stored one can exceed the 55vh cap.
        const startHeight =
          event.currentTarget.parentElement?.getBoundingClientRect().height ?? height;
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const move = (moveEvent: PointerEvent) =>
          onResize(startHeight + startY - moveEvent.clientY);
        const up = () => {
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", up);
          target.removeEventListener("pointercancel", up);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", up);
        target.addEventListener("pointercancel", up);
      }}
    />
  );
}
