import { useAtomValue } from "@effect/atom-react";
import type { CodeViewItem } from "@pierre/diffs/react";
import {
  deriveThreadCheckpointSummaries,
  type ThreadCheckpointSummary,
} from "@t3tools/client-runtime/state/thread-checkpoints";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Columns2,
  FileDiff,
  RefreshCw,
  Rows3,
  TextWrap,
  X,
} from "lucide-react";
import { type MouseEvent, type ReactNode, useMemo, useState } from "react";

import { Button } from "~/components/ui/Button";
import {
  Menu,
  MenuItem,
  MenuLabel,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/Menu";
import { Segmented } from "~/components/ui/Segmented";
import { Tooltip } from "~/components/ui/Tooltip";
import { useThreadCwd } from "~/components/terminal/useThreadCwd";
import { cn } from "~/lib/cn";
import { relativeAge, shortcutLabel } from "~/lib/format";
import { SHORTCUTS } from "~/lib/shortcuts";
import { useNow } from "~/lib/useNow";
import {
  environmentThreadDetails,
  orchestrationEnvironment,
  reviewEnvironment,
} from "~/state/atoms";
import { useEnvironmentQuery } from "~/state/hooks";
import { useLayout } from "~/stores/layout";
import type { ThreadTab } from "~/stores/tabs";
import { DiffCodeView } from "./DiffCodeView";
import { fileDiffKey, fileDiffPath, fnv1a, parseDiff } from "./diffPatch";
import { useDiffPrefs } from "./diffPrefs";

/** The right-hand "Changes" pane for a thread: per-turn and whole-thread diffs. */
export function DiffPane({ threadRef }: { readonly threadRef: ThreadTab }) {
  // Keyed so scope and collapse state never leak between threads.
  return (
    <ThreadChanges key={`${threadRef.environmentId}:${threadRef.threadId}`} threadRef={threadRef} />
  );
}

/** "all" = every turn in the session, "uncommitted" = the live working tree, else one turn. */
type Scope =
  | { readonly kind: "all" }
  | { readonly kind: "uncommitted" }
  | { readonly kind: "turn"; readonly runId: string };

const NO_KEYS: ReadonlySet<string> = new Set();

function ThreadChanges({ threadRef }: { readonly threadRef: ThreadTab }) {
  const thread = useAtomValue(environmentThreadDetails.threadAtom(threadRef));
  const summaries = checkpointSummaries(thread?.projection ?? null);
  const { cwd } = useThreadCwd(threadRef);
  const [picked, setPicked] = useState<Scope>({ kind: "all" });
  const [collapsed, setCollapsed] = useState<{
    readonly scope: string;
    readonly keys: ReadonlySet<string>;
  }>({
    scope: "",
    keys: NO_KEYS,
  });
  const diffStyle = useDiffPrefs((state) => state.diffStyle);
  const setDiffStyle = useDiffPrefs((state) => state.setDiffStyle);
  const wrap = useDiffPrefs((state) => state.wrap);
  const toggleWrap = useDiffPrefs((state) => state.toggleWrap);
  const toggleDiff = useLayout((state) => state.toggleDiff);

  // The newest checkpoint can be missing or errored (an interrupted turn), and the
  // server cannot diff to it; the session view ends at the newest usable one.
  const latest = summaries.find((summary) => summary.status === "ready");
  const selectedTurn =
    picked.kind === "turn"
      ? summaries.find((summary) => summary.runId === picked.runId)
      : undefined;
  // A turn that vanished (thread reverted) falls back to the whole session.
  const scope: Scope =
    picked.kind === "turn" && selectedTurn === undefined ? { kind: "all" } : picked;
  const key = scopeKey(scope);

  const range =
    scope.kind === "all"
      ? latest
        ? { from: 0, to: latest.checkpointTurnCount }
        : null
      : scope.kind === "turn" && selectedTurn
        ? {
            from: Math.max(0, selectedTurn.checkpointTurnCount - 1),
            to: selectedTurn.checkpointTurnCount,
          }
        : null;

  const fullDiff = useEnvironmentQuery(
    range !== null && range.from === 0
      ? orchestrationEnvironment.fullThreadDiff({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, toTurnCount: range.to },
        })
      : null,
  );
  const turnDiff = useEnvironmentQuery(
    range !== null && range.from > 0
      ? orchestrationEnvironment.turnDiff({
          environmentId: threadRef.environmentId,
          input: { threadId: threadRef.threadId, fromTurnCount: range.from, toTurnCount: range.to },
        })
      : null,
  );
  const preview = useEnvironmentQuery(
    scope.kind === "uncommitted" && cwd !== null
      ? reviewEnvironment.diffPreview({ environmentId: threadRef.environmentId, input: { cwd } })
      : null,
  );

  const workingTree =
    preview.data?.sources.find((source) => source.kind === "working-tree") ?? null;
  const query =
    scope.kind === "uncommitted"
      ? { ...preview, patch: preview.data === null ? null : (workingTree?.diff ?? "") }
      : range?.from === 0
        ? { ...fullDiff, patch: fullDiff.data?.diff ?? null }
        : { ...turnDiff, patch: turnDiff.data?.diff ?? null };

  // A new checkpoint swaps "All changes" to a new query; keep showing the last
  // patch for the same scope until it lands so the viewer doesn't flash or lose scroll.
  const [held, setHeld] = useState<{ readonly key: string; readonly patch: string } | null>(null);
  if (query.patch !== null && (held?.key !== key || held.patch !== query.patch)) {
    setHeld({ key, patch: query.patch });
  }
  const patch = query.patch ?? (held?.key === key ? held.patch : null);

  const parsed = useMemo(() => parseDiff(patch, key), [patch, key]);
  const files = parsed?.kind === "files" ? parsed.files : [];
  const collapsedKeys = collapsed.scope === key ? collapsed.keys : NO_KEYS;
  const allCollapsed =
    files.length > 0 && files.every((file) => collapsedKeys.has(fileDiffKey(file)));

  const toggleFile = (fileKey: string) => {
    const next = new Set(collapsedKeys);
    if (next.has(fileKey)) next.delete(fileKey);
    else next.add(fileKey);
    setCollapsed({ scope: key, keys: next });
  };

  const items = useMemo(
    (): ReadonlyArray<CodeViewItem> =>
      files.map((file) => {
        const id = fileDiffKey(file);
        const isCollapsed = collapsedKeys.has(id);
        return {
          id,
          type: "diff",
          fileDiff: file,
          collapsed: isCollapsed,
          version: fnv1a(`${file.cacheKey ?? id}:${isCollapsed ? 1 : 0}`),
        };
      }),
    [files, collapsedKeys],
  );

  // Clicking a file header (not its controls) toggles that file, like a disclosure row.
  const onHeaderClick = (event: MouseEvent) => {
    const path = event.nativeEvent.composedPath();
    for (const node of path) {
      if (node === event.currentTarget) break;
      if (node instanceof HTMLButtonElement || node instanceof HTMLAnchorElement) return;
    }
    const header = path.find(
      (node): node is HTMLElement =>
        node instanceof HTMLElement && node.hasAttribute("data-diffs-header"),
    );
    const title = header?.querySelector("[data-title]")?.textContent?.trim();
    const file = title
      ? files.find((candidate) => fileDiffPath(candidate) === title || candidate.name === title)
      : undefined;
    if (file) toggleFile(fileDiffKey(file));
  };

  const scopeLabel =
    scope.kind === "all"
      ? "All changes"
      : scope.kind === "uncommitted"
        ? "Uncommitted"
        : selectedTurn === latest
          ? `Latest turn · ${selectedTurn?.checkpointTurnCount ?? ""}`
          : `Turn ${selectedTurn?.checkpointTurnCount ?? "?"}`;

  const noCheckpoints = thread !== null && summaries.length === 0 && scope.kind !== "uncommitted";

  let body: ReactNode;
  if (thread === null && scope.kind !== "uncommitted") {
    body = <PaneMessage title="Loading session…" />;
  } else if (noCheckpoints) {
    body = (
      <PaneMessage
        icon={<FileDiff className="size-5" />}
        title="No changes yet"
        detail="Each turn that edits files records a checkpoint here."
        action={
          <Button variant="secondary" size="sm" onClick={() => setPicked({ kind: "uncommitted" })}>
            View uncommitted changes
          </Button>
        }
      />
    );
  } else if (scope.kind === "uncommitted" && cwd === null) {
    body = <PaneMessage title="Resolving working directory…" />;
  } else if (query.error !== null && patch === null) {
    body = (
      <PaneMessage
        icon={<AlertCircle className="size-5 text-danger" />}
        title="Couldn't load changes"
        detail={query.error}
        action={
          <Button variant="secondary" size="sm" onClick={query.refresh}>
            Retry
          </Button>
        }
      />
    );
  } else if (patch === null) {
    body = <PaneMessage title="Loading changes…" />;
  } else if (parsed === null) {
    body = (
      <PaneMessage
        icon={<Check className="size-5" />}
        title={scope.kind === "uncommitted" ? "Working tree is clean" : "No file changes"}
        detail={
          scope.kind === "uncommitted"
            ? "Nothing uncommitted in this workspace."
            : "This range didn't change any files."
        }
      />
    );
  } else if (parsed.kind === "raw") {
    body = (
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <p className="mb-2 text-xs text-muted">{parsed.reason}</p>
        <pre className="font-mono text-[11.5px] leading-relaxed whitespace-pre text-fg/90">
          {parsed.text}
        </pre>
      </div>
    );
  } else {
    body = (
      <div className="min-h-0 flex-1" onClick={onHeaderClick}>
        <DiffCodeView
          key={key}
          className="h-full min-h-0 overflow-auto"
          items={items}
          options={{
            diffStyle,
            lineDiffType: "none",
            overflow: wrap ? "wrap" : "scroll",
          }}
          renderHeaderPrefix={(item) => {
            const isCollapsed = item.collapsed === true;
            const path = item.type === "diff" ? fileDiffPath(item.fileDiff) : item.id;
            return (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={isCollapsed ? `Expand ${path}` : `Collapse ${path}`}
                aria-expanded={!isCollapsed}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFile(item.id);
                }}
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform duration-[180ms] ease-out",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </Button>
            );
          }}
        />
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col" aria-label="Changes">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-line pr-2 pl-3">
        <h2 className="text-[13px] font-semibold">Changes</h2>
        <ScopeMenu label={scopeLabel} scope={scope} summaries={summaries} onSelect={setPicked} />
        <div className="flex-1" />
        <Tooltip label="Refresh">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Refresh"
            disabled={query.isPending || (range === null && scope.kind !== "uncommitted")}
            onClick={query.refresh}
          >
            <RefreshCw className="size-3.5" />
          </Button>
        </Tooltip>
        <Tooltip label={allCollapsed ? "Expand all" : "Collapse all"}>
          <Button
            size="icon"
            variant="ghost"
            aria-label={allCollapsed ? "Expand all files" : "Collapse all files"}
            disabled={files.length === 0}
            onClick={() =>
              setCollapsed({
                scope: key,
                keys: allCollapsed ? NO_KEYS : new Set(files.map(fileDiffKey)),
              })
            }
          >
            {allCollapsed ? (
              <ChevronsUpDown className="size-3.5" />
            ) : (
              <ChevronsDownUp className="size-3.5" />
            )}
          </Button>
        </Tooltip>
        <Tooltip label={wrap ? "Don't wrap lines" : "Wrap lines"}>
          <Button
            size="icon"
            variant={wrap ? "secondary" : "ghost"}
            aria-label="Wrap lines"
            aria-pressed={wrap}
            onClick={toggleWrap}
          >
            <TextWrap className="size-3.5" />
          </Button>
        </Tooltip>
        <Segmented
          value={diffStyle}
          onChange={setDiffStyle}
          options={[
            { value: "unified", label: <Rows3 className="size-3.5" aria-label="Unified" /> },
            { value: "split", label: <Columns2 className="size-3.5" aria-label="Split" /> },
          ]}
        />
        <Tooltip label="Close" shortcut={shortcutLabel(SHORTCUTS.toggleDiff)}>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Close changes"
            onClick={() => toggleDiff(false)}
          >
            <X className="size-3.5" />
          </Button>
        </Tooltip>
      </header>
      {parsed?.kind === "files" ? (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line px-3 text-[12px] text-muted tabular-nums">
          <span>
            {parsed.files.length} {parsed.files.length === 1 ? "file" : "files"}
          </span>
          <span className="text-faint">·</span>
          <span className="font-mono text-[11px] text-success">+{parsed.additions}</span>
          <span className="font-mono text-[11px] text-danger">−{parsed.deletions}</span>
          {query.error !== null ? (
            <span className="ml-auto truncate text-danger">Refresh failed: {query.error}</span>
          ) : scope.kind === "uncommitted" && workingTree?.truncated ? (
            <span className="ml-auto text-warning">Truncated</span>
          ) : null}
        </div>
      ) : null}
      {body}
    </section>
  );
}

const scopeKey = (scope: Scope) => (scope.kind === "turn" ? `turn:${scope.runId}` : scope.kind);

// Projections change on every streamed event; checkpoints change once per
// turn. Cache by the checkpoints array so the menu doesn't recompute per token.
const summaryCache = new WeakMap<object, ReadonlyArray<ThreadCheckpointSummary>>();
function checkpointSummaries(projection: OrchestrationV2ThreadProjection | null) {
  if (projection === null) return [];
  const cached = summaryCache.get(projection.checkpoints);
  if (cached) return cached;
  const sorted = [...deriveThreadCheckpointSummaries(projection)].sort(
    (a, b) =>
      b.checkpointTurnCount - a.checkpointTurnCount || b.completedAt.localeCompare(a.completedAt),
  );
  summaryCache.set(projection.checkpoints, sorted);
  return sorted;
}

function ScopeMenu({
  label,
  scope,
  summaries,
  onSelect,
}: {
  readonly label: string;
  readonly scope: Scope;
  readonly summaries: ReadonlyArray<ThreadCheckpointSummary>;
  readonly onSelect: (scope: Scope) => void;
}) {
  const now = useNow();
  const current = scopeKey(scope);
  // An empty slot keeps unchecked labels aligned with the checked one.
  const check = (key: string) => (key === current ? <Check className="size-3.5" /> : <span />);
  return (
    <Menu>
      <MenuTrigger className="ml-1 flex h-7 min-w-0 items-center gap-1 rounded-lg px-2 text-[12.5px] text-muted outline-none hover:bg-hover hover:text-fg data-[popup-open]:bg-hover">
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3 shrink-0 text-faint" />
      </MenuTrigger>
      <MenuPopup className="w-72">
        <MenuItem
          icon={check("all")}
          onClick={() => onSelect({ kind: "all" })}
          disabled={summaries.length === 0}
        >
          All changes in this session
        </MenuItem>
        <MenuItem icon={check("uncommitted")} onClick={() => onSelect({ kind: "uncommitted" })}>
          Uncommitted changes
        </MenuItem>
        {summaries.length > 0 ? (
          <>
            <MenuSeparator />
            <MenuLabel>Turns</MenuLabel>
            {summaries.map((summary) => {
              const additions = summary.files.reduce((total, file) => total + file.additions, 0);
              const deletions = summary.files.reduce((total, file) => total + file.deletions, 0);
              const key = scopeKey({ kind: "turn", runId: summary.runId });
              return (
                <MenuItem
                  key={summary.runId}
                  icon={check(key)}
                  onClick={() => onSelect({ kind: "turn", runId: summary.runId })}
                  shortcut={relativeAge(summary.completedAt, now)}
                >
                  <span className="flex items-center gap-2">
                    <span>Turn {summary.checkpointTurnCount}</span>
                    {summary.status === "ready" ? (
                      <span className="font-mono text-[11px] text-faint">
                        {summary.files.length}f <span className="text-success">+{additions}</span>{" "}
                        <span className="text-danger">−{deletions}</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-warning">{summary.status}</span>
                    )}
                  </span>
                </MenuItem>
              );
            })}
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}

function PaneMessage({
  icon,
  title,
  detail,
  action,
}: {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly detail?: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
      {icon ? <div className="mb-1 text-faint">{icon}</div> : null}
      <div className="text-[13px] font-medium text-fg/90">{title}</div>
      {detail ? <div className="max-w-72 text-[12px] break-words text-muted">{detail}</div> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
