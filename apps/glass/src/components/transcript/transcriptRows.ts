import { turnItemIsWorkspacePreparation } from "@t3tools/client-runtime/state/turn-item-presentation";
import type { OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";

import { TOOL_ITEM_TYPES } from "./toolEntry";

/**
 * One virtualized transcript row: a single projected item, or a run of
 * consecutive tool items (with any reasoning between them) folded into a group.
 * `id` is stable for the life of the row, so it doubles as the list key.
 */
export type TranscriptRow =
  | { readonly kind: "item"; readonly id: string; readonly row: OrchestrationV2ProjectedTurnItem }
  | {
      readonly kind: "tools";
      readonly id: string;
      readonly rows: ReadonlyArray<OrchestrationV2ProjectedTurnItem>;
    };

/**
 * Groups visible items into transcript rows. Runs of tool items fold into one
 * group; reasoning inside such a run joins it, while reasoning with no tool
 * work around it stays its own row.
 */
export function buildTranscriptRows(
  items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>,
): TranscriptRow[] {
  const echoes = new Set<string>();
  for (const { item } of items) {
    if (item.type === "user_input_request" && item.questionAnswer) {
      echoes.add(`async-answer:${item.questionAnswer.requestId}`);
    }
  }

  const rows: TranscriptRow[] = [];
  let run: OrchestrationV2ProjectedTurnItem[] = [];
  const flush = () => {
    if (run.length === 0) return;
    if (run.some((row) => row.item.type !== "reasoning")) {
      rows.push({ kind: "tools", id: `tools:${itemKey(run[0]!)}`, rows: run });
    } else {
      for (const row of run) rows.push({ kind: "item", id: itemKey(row), row });
    }
    run = [];
  };

  for (const row of items) {
    if (isHidden(row, echoes)) continue;
    if (isToolish(row)) {
      run.push(row);
      continue;
    }
    flush();
    rows.push({ kind: "item", id: itemKey(row), row });
  }
  flush();
  return rows;
}

/**
 * A `buildTranscriptRows` that hands back the previous row object whenever its
 * items are unchanged. Projected rows keep their identity across updates, so a
 * streamed token produces exactly one new row and every other memoized row
 * component skips rendering.
 */
export function createTranscriptRowsBuilder() {
  let previous = new Map<string, TranscriptRow>();
  return (items: ReadonlyArray<OrchestrationV2ProjectedTurnItem>): ReadonlyArray<TranscriptRow> => {
    const next = new Map<string, TranscriptRow>();
    const rows = buildTranscriptRows(items).map((row) => {
      const before = previous.get(row.id);
      const kept = before !== undefined && sameRow(before, row) ? before : row;
      next.set(kept.id, kept);
      return kept;
    });
    previous = next;
    return rows;
  };
}

const itemKey = (row: OrchestrationV2ProjectedTurnItem) =>
  `${row.sourceThreadId}:${row.sourceItemId}`;

/** Items the transcript never shows: composer-owned progress and setup bookkeeping. */
function isHidden(row: OrchestrationV2ProjectedTurnItem, echoes: ReadonlySet<string>): boolean {
  const { item } = row;
  if (item.type === "todo_list" || item.type === "checkpoint") return true;
  if (turnItemIsWorkspacePreparation(item)) return true;
  // An answered question already shows its answers; the echo message is noise.
  return item.type === "user_message" && echoes.has(item.messageId);
}

const isToolish = (row: OrchestrationV2ProjectedTurnItem) =>
  TOOL_ITEM_TYPES.has(row.item.type) || row.item.type === "reasoning";

function sameRow(previous: TranscriptRow, next: TranscriptRow): boolean {
  if (previous.kind === "item" && next.kind === "item") return previous.row === next.row;
  if (previous.kind !== "tools" || next.kind !== "tools") return false;
  return (
    previous.rows.length === next.rows.length &&
    previous.rows.every((row, index) => row === next.rows[index])
  );
}
