import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { Brain, ChevronRight } from "lucide-react";

import { cn } from "~/lib/cn";
import { useDisclosure } from "./context";
import { Markdown } from "./Markdown";

type ReasoningItem = Extract<OrchestrationV2TurnItem, { type: "reasoning" }>;

function thoughtLabel(item: ReasoningItem): string {
  if (item.streaming) return "Thinking…";
  if (item.startedAt === null || item.completedAt === null) return "Thought";
  const seconds = Math.round(
    (DateTime.toEpochMillis(item.completedAt) - DateTime.toEpochMillis(item.startedAt)) / 1000,
  );
  return seconds >= 2 ? `Thought for ${seconds}s` : "Thought";
}

/** A collapsed "Thought" line that expands to the reasoning text. */
export function ReasoningRow({
  item,
  compact = false,
}: {
  readonly item: ReasoningItem;
  readonly compact?: boolean;
}) {
  const [open, toggle] = useDisclosure(`reasoning:${item.id}`);
  const hasText = item.text.trim().length > 0;
  return (
    <div className={cn(!compact && "py-1")}>
      <button
        type="button"
        disabled={!hasText}
        onClick={toggle}
        aria-expanded={open}
        className="group/thought flex items-center gap-2 py-1 text-[13px] text-muted transition-colors hover:text-fg disabled:hover:text-muted"
      >
        <Brain className="size-3.5 shrink-0 text-faint" />
        <span>{thoughtLabel(item)}</span>
        {hasText ? (
          <ChevronRight
            className={cn(
              "size-3.5 text-faint opacity-0 transition-[opacity,transform] duration-150 group-hover/thought:opacity-100",
              open && "rotate-90 opacity-100",
            )}
          />
        ) : null}
      </button>
      {open && hasText ? (
        <div className="mt-1 mb-2 ml-[7px] border-l border-line pl-4">
          <Markdown text={item.text} streaming={item.streaming} className="glass-md-quiet" />
        </div>
      ) : null}
    </div>
  );
}
