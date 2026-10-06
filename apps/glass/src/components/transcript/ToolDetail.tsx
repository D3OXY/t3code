import {
  toolCallLines,
  turnItemDetailRevision,
  turnItemNeedsDetailFetch,
  turnItemOutputImages,
  turnItemOutputText,
} from "@t3tools/client-runtime/work-log/item-detail";
import { withVisibleControlCharacters } from "@t3tools/client-runtime/work-log/command-label";
import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import { useMemo, useState, type ReactNode } from "react";

import { cn } from "~/lib/cn";
import { orchestrationEnvironment } from "~/state/atoms";
import { useEnvironmentQuery } from "~/state/hooks";
import { AssetThumbnail, ImageLightbox, type PreviewImage } from "./Attachments";
import { useTranscript } from "./context";
import { FileDiff } from "./FileDiff";
import { diffTexts, parseUnifiedDiff, type DiffLine } from "./lineDiff";
import { relativeToRoot } from "./toolEntry";

const MAX_OUTPUT_CHARS = 80_000;

/**
 * The item with its full input and output. The timeline withholds large tool
 * output; this fetches it (keyed by revision, so a live row refetches once it
 * settles) only while the detail is open.
 */
function useItemDetail(item: OrchestrationV2TurnItem) {
  const { threadRef } = useTranscript();
  const needsFetch = turnItemNeedsDetailFetch(item);
  const query = useEnvironmentQuery(
    needsFetch
      ? orchestrationEnvironment.turnItem({
          environmentId: threadRef.environmentId,
          input: {
            threadId: item.threadId,
            itemId: item.id,
            revision: turnItemDetailRevision(item),
          },
        })
      : null,
  );
  return {
    item: query.data?.item ?? item,
    loading: needsFetch && query.data === null && query.error === null,
    error: needsFetch ? query.error : null,
  };
}

/** Diff lines for a file change: provider diff text, or a diff of its before/after text. */
export function fileChangeLines(
  item: Extract<OrchestrationV2TurnItem, { type: "file_change" }>,
): DiffLine[] {
  if (item.status === "failed") return [];
  if (item.diffStr?.trim()) return parseUnifiedDiff(item.diffStr);
  if (item.oldStr !== undefined || item.newStr !== undefined)
    return diffTexts(item.oldStr ?? "", item.newStr ?? "");
  return [];
}

function Output({
  text,
  tone = "muted",
}: {
  readonly text: string;
  readonly tone?: "muted" | "danger";
}) {
  const truncated = text.length > MAX_OUTPUT_CHARS;
  return (
    <pre
      className={cn(
        "max-h-72 overflow-auto px-3 py-2 font-mono text-[12px] leading-5 break-words whitespace-pre-wrap",
        tone === "danger" ? "text-danger" : "text-muted",
      )}
    >
      {truncated ? `${text.slice(0, MAX_OUTPUT_CHARS)}\n…` : text}
    </pre>
  );
}

function Panel({ children }: { readonly children: ReactNode }) {
  return <div className="overflow-hidden rounded-lg border border-line bg-code">{children}</div>;
}

function Status({
  loading,
  error,
  empty,
}: {
  loading: boolean;
  error: string | null;
  empty: string | null;
}) {
  if (loading) return <p className="px-3 py-2 text-[12px] text-faint">Loading output…</p>;
  if (error) return <p className="px-3 py-2 text-[12px] text-danger">{error}</p>;
  return empty ? <p className="px-3 py-2 text-[12px] text-faint">{empty}</p> : null;
}

function CommandDetail({
  item,
}: {
  readonly item: Extract<OrchestrationV2TurnItem, { type: "command_execution" }>;
}) {
  const detail = useItemDetail(item);
  const output = turnItemOutputText(detail.item);
  const exitCode = detail.item.type === "command_execution" ? detail.item.exitCode : undefined;
  return (
    <Panel>
      <pre className="px-3 py-2 font-mono text-[12px] leading-5 break-words whitespace-pre-wrap">
        <span className="text-faint select-none">$ </span>
        {withVisibleControlCharacters(item.input.trim())}
      </pre>
      <div className="border-t border-line">
        {output ? (
          <Output text={output} />
        ) : (
          <Status
            loading={detail.loading}
            error={detail.error}
            empty={item.status === "running" ? "Running…" : "No output."}
          />
        )}
      </div>
      {exitCode !== undefined ? (
        <div
          className={cn(
            "border-t border-line px-3 py-1 font-mono text-[11px]",
            exitCode === 0 ? "text-faint" : "text-danger",
          )}
        >
          exit {exitCode}
        </div>
      ) : null}
    </Panel>
  );
}

function FileChangeDetail({
  item,
}: {
  readonly item: Extract<OrchestrationV2TurnItem, { type: "file_change" }>;
}) {
  const { workspaceRoot } = useTranscript();
  const lines = useMemo(() => fileChangeLines(item), [item]);
  if (item.status === "failed" && item.diffStr?.trim()) {
    return (
      <Panel>
        <Output text={item.diffStr} tone="danger" />
      </Panel>
    );
  }
  const changes = item.changes ?? [];
  return (
    <div className="space-y-1.5">
      {changes.length > 1 ? (
        <ul className="space-y-0.5 font-mono text-[12px] text-muted">
          {changes.map((change) => (
            <li key={`${change.operation}:${change.path}`} className="truncate">
              <span className="text-faint">{change.operation} </span>
              {relativeToRoot(change.path, workspaceRoot)}
            </li>
          ))}
        </ul>
      ) : null}
      {lines.length > 0 || changes.length <= 1 ? <FileDiff lines={lines} /> : null}
    </div>
  );
}

function ToolCallDetail({
  item,
}: {
  readonly item: Extract<OrchestrationV2TurnItem, { type: "dynamic_tool" }>;
}) {
  const detail = useItemDetail(item);
  const { threadRef } = useTranscript();
  const [preview, setPreview] = useState<PreviewImage | null>(null);
  const full = detail.item.type === "dynamic_tool" ? detail.item : item;
  const call = toolCallLines({ args: full.input });
  const output = turnItemOutputText(full);
  const images = turnItemOutputImages(full);
  const hasCall = call.args !== null || call.argsText !== null;
  return (
    <Panel>
      {call.args ? (
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 px-3 py-2 font-mono text-[12px] leading-5">
          {call.args.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-faint">{key}</dt>
              <dd className="max-h-40 overflow-auto break-words whitespace-pre-wrap text-muted">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : call.argsText ? (
        <Output text={call.argsText} />
      ) : null}
      <div className={cn(hasCall && "border-t border-line")}>
        {output ? (
          <Output text={output} />
        ) : images.length === 0 ? (
          <Status
            loading={detail.loading}
            error={detail.error}
            empty={item.status === "running" ? "Running…" : hasCall ? null : "No output."}
          />
        ) : null}
        {images.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-3 py-2">
            {images.map((resource) => (
              <AssetThumbnail
                key={resource.index}
                environmentId={threadRef.environmentId}
                resource={resource}
                alt={`Tool output image ${resource.index + 1}`}
                className="h-28 w-40"
                onOpen={setPreview}
              />
            ))}
          </div>
        ) : null}
      </div>
      <ImageLightbox image={preview} onClose={() => setPreview(null)} />
    </Panel>
  );
}

/** The expanded body of a tool row: full command and output, a diff, or results. */
export function ToolDetail({ item }: { readonly item: OrchestrationV2TurnItem }) {
  switch (item.type) {
    case "command_execution":
      return <CommandDetail item={item} />;
    case "file_change":
      return <FileChangeDetail item={item} />;
    case "dynamic_tool":
      return <ToolCallDetail item={item} />;
    case "file_search":
    case "web_search": {
      const output = turnItemOutputText(item);
      const query = item.type === "web_search" ? item.patterns?.join("\n") : item.pattern;
      return (
        <Panel>
          {query ? <Output text={query} /> : null}
          {output ? (
            <div className={cn(query && "border-t border-line")}>
              <Output text={output} />
            </div>
          ) : null}
        </Panel>
      );
    }
    case "notification":
      return item.detail?.trim() ? (
        <p className="text-[13px] leading-relaxed break-words whitespace-pre-wrap text-muted">
          {item.detail}
        </p>
      ) : null;
    default:
      return null;
  }
}
