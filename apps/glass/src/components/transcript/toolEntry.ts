import { commandDisplayText } from "@t3tools/client-runtime/work-log/command-label";
import {
  contextCompactionLabel,
  resolveWorkEntryToolPresentation,
  type WorkLogPresentationEntry,
} from "@t3tools/client-runtime/work-log/presentation";
import { extractToolActivityPresentation } from "@t3tools/client-runtime/work-log/tool-presentation";
import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import {
  classifyToolActivity,
  collectToolFilePaths,
  dynamicToolTitle,
  formatReadToolLabel,
  formatSearchToolLabel,
} from "@t3tools/shared/toolActivity";
import * as DateTime from "effect/DateTime";

import type { ItemOf } from "./turnItem";

/**
 * Turn item types that fold into a tool group. Reasoning joins a group only
 * when the run around it contains real tool work (see `buildTranscriptRows`).
 */
export const TOOL_ITEM_TYPES: ReadonlySet<OrchestrationV2TurnItem["type"]> = new Set([
  "command_execution",
  "file_change",
  "file_search",
  "web_search",
  "dynamic_tool",
  "notification",
]);

/**
 * The work-log entry the shared presenters (`summarizeToolGroup`,
 * `toolGroupAction`, `resolveWorkEntryToolPresentation`) expect for one item.
 * Mirrors apps/web session-logic `projectedWorkEntry`.
 */
export function toolWorkEntry(item: OrchestrationV2TurnItem): WorkLogPresentationEntry {
  const title = item.title?.trim() || null;
  const common = {
    id: item.id,
    createdAt: DateTime.formatIso(item.startedAt ?? item.updatedAt),
    tone:
      item.type === "reasoning"
        ? "thinking"
        : item.type !== "notification" && TOOL_ITEM_TYPES.has(item.type)
          ? "tool"
          : "info",
    itemType: item.type,
    toolLifecycleStatus: toolLifecycle(item),
    structuredPayload: item,
    ...extractToolActivityPresentation(item),
  } as const;

  switch (item.type) {
    case "reasoning":
      return { ...common, label: title ?? "Thinking", ...(item.text ? { detail: item.text } : {}) };
    case "command_execution":
      return {
        ...common,
        label: title ?? "Ran command",
        command: item.input,
        rawCommand: item.input,
        toolTitle: title ?? "Command",
        toolData: item,
      };
    case "file_change":
      return {
        ...common,
        label:
          title ??
          (item.changes !== undefined && item.changes.length > 1
            ? `Changed ${item.changes.length} files`
            : `Changed ${item.fileName}`),
        changedFiles: item.changes?.map((change) => change.path) ?? [item.fileName],
        toolTitle: title ?? "File change",
        toolData: item,
      };
    case "file_search":
      return {
        ...common,
        label: title ?? formatSearchToolLabel(item) ?? "Searched files",
        ...(item.pattern ? { detail: item.pattern } : {}),
        toolTitle: title ?? "File search",
        toolData: item,
      };
    case "web_search":
      return {
        ...common,
        label: title ?? "Searched the web",
        ...(item.patterns?.length ? { detail: item.patterns.join(", ") } : {}),
        toolTitle: title ?? "Web search",
        toolData: item,
      };
    case "dynamic_tool": {
      const classified = classifyToolActivity({
        itemType: "dynamic_tool_call",
        data: { toolName: item.toolName ?? undefined, input: item.input },
      });
      const [readPath] = collectToolFilePaths({ input: item.input });
      const derivedTitle = dynamicToolTitle(item.toolName, item.input);
      return {
        ...common,
        label:
          title ??
          derivedTitle ??
          (classified === "read"
            ? formatReadToolLabel(readPath ?? "")
            : classified === "search"
              ? (formatSearchToolLabel({ input: item.input }) ?? item.toolName ?? "Tool call")
              : (item.toolName ?? "Tool call")),
        toolTitle: title ?? item.toolName ?? "Tool",
        toolData: { input: item.input, output: item.output },
      };
    }
    case "notification":
      return { ...common, label: item.summary, ...(item.detail ? { detail: item.detail } : {}) };
    case "compaction":
      return { ...common, label: contextCompactionLabel(item) };
    default:
      return { ...common, label: title ?? item.type.replaceAll("_", " ") };
  }
}

/** The relative path when `path` sits inside `root`, otherwise the path unchanged. */
export function relativeToRoot(path: string, root: string | null): string {
  if (!root) return path;
  const base = root.replace(/[\\/]+$/, "");
  return path.startsWith(`${base}/`) || path.startsWith(`${base}\\`)
    ? path.slice(base.length + 1)
    : path;
}

/** What a tool row says on its one line: a verb-ish label and a detail. */
interface ToolRowText {
  readonly label: string;
  readonly detail: string | null;
  /** The detail is code (a command or a path), so it renders monospaced. */
  readonly mono: boolean;
}

/** One-line presentation for a tool row; the label is never the raw detail repeated. */
export function toolRowText(
  item: OrchestrationV2TurnItem,
  entry: WorkLogPresentationEntry,
  workspaceRoot: string | null,
): ToolRowText {
  const title = item.title?.trim() || null;
  switch (item.type) {
    case "command_execution": {
      const command = commandDisplayText(item.input).split("\n")[0] ?? "";
      return {
        label: title && title !== item.input.trim() ? title : "Ran",
        detail: command,
        mono: true,
      };
    }
    case "file_change": {
      const operation = item.changes?.[0]?.operation.toLowerCase();
      const verb =
        item.status === "failed"
          ? "Failed to edit"
          : operation === "add" || operation === "create"
            ? "Created"
            : operation === "delete" || operation === "remove"
              ? "Deleted"
              : "Edited";
      const extra = (item.changes?.length ?? 1) - 1;
      return {
        label: verb,
        detail: `${relativeToRoot(item.fileName, workspaceRoot)}${extra > 0 ? ` +${extra} more` : ""}`,
        mono: true,
      };
    }
    case "file_search":
      return { label: "Searched", detail: item.pattern?.trim() || title || "files", mono: true };
    case "web_search":
      return { label: "Searched the web", detail: item.patterns?.join(", ") || null, mono: false };
    case "notification":
      return {
        label: item.summary,
        detail: item.detail?.split("\n")[0]?.trim() || null,
        mono: false,
      };
    case "dynamic_tool": {
      const displayName = resolveWorkEntryToolPresentation(entry)?.displayName ?? null;
      const label = displayName ?? entry.label;
      const readPath = collectToolFilePaths({ input: item.input })[0];
      if (label.startsWith("Read ") && readPath) {
        return { label: "Read", detail: relativeToRoot(readPath, workspaceRoot), mono: true };
      }
      return {
        label,
        detail:
          item.toolName && item.toolName !== label && displayName === null ? item.toolName : null,
        mono: true,
      };
    }
    default:
      return { label: entry.label, detail: entry.detail?.split("\n")[0] ?? null, mono: false };
  }
}

/** Label and detail for a provider error, including retry progress. */
export function providerErrorPresentation(item: ItemOf<"error">) {
  if (item.retry === undefined) {
    return {
      label:
        item.failure.class === "usage_limit"
          ? "Usage limit reached"
          : item.title?.trim() || "Provider error",
      detail: item.failure.message,
    };
  }
  const progress =
    item.retry.maxAttempts === null
      ? `${item.retry.attempt}`
      : `${item.retry.attempt}/${item.retry.maxAttempts}`;
  const label =
    item.status === "running"
      ? `Retrying provider (${progress})`
      : item.status === "completed"
        ? `Provider recovered (${progress} retries)`
        : item.status === "failed"
          ? `${item.failure.class === "usage_limit" ? "Usage limit reached" : "Provider error"} after ${progress} retries`
          : `Provider retry stopped (${progress})`;
  const delay = item.retry.retryDelayMs;
  const retryDelay =
    item.status === "running" && delay !== null && delay > 0
      ? delay < 1_000
        ? ` Retrying in ${delay}ms.`
        : ` Retrying in ${(delay / 1_000).toFixed(1).replace(/\.0$/u, "")}s.`
      : "";
  return { label, detail: `${item.failure.message}${retryDelay}` };
}

/** Maps an item status onto the work-log lifecycle the shared presenters read. */
function toolLifecycle(item: OrchestrationV2TurnItem) {
  switch (item.status) {
    case "pending":
    case "running":
    case "waiting":
      return "inProgress";
    case "completed":
      return "completed";
    case "idle":
      return "idle";
    case "failed":
      return "failed";
    case "cancelled":
    case "interrupted":
      return "stopped";
  }
}
