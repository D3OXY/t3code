import type { LegendListRef } from "@legendapp/list/react";
import { useEffect, useMemo, useState, type RefObject } from "react";

import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import type { TranscriptRow } from "./transcriptRows";

const PREVIEW_CHARS = 140;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Prompt {
  readonly index: number;
  readonly id: string;
  readonly text: string;
}

/**
 * Selects the user prompts from the rows, returning the previous array while
 * they are unchanged. Rows change on every streamed token; prompts rarely do,
 * so the scroll subscription below is not rebuilt per token.
 */
function createPromptSelector() {
  let previous: ReadonlyArray<Prompt> = [];
  return (rows: ReadonlyArray<TranscriptRow>): ReadonlyArray<Prompt> => {
    const next = rows.flatMap((row, index) =>
      row.kind === "item" && row.row.item.type === "user_message"
        ? [{ index, id: row.id, text: row.row.item.text.trim().replace(/\s+/g, " ") }]
        : [],
    );
    const same =
      next.length === previous.length &&
      next.every(
        (prompt, at) => prompt.index === previous[at]?.index && prompt.id === previous[at]?.id,
      );
    if (!same) previous = next;
    return previous;
  };
}

/**
 * A minimap of the user's prompts down the left gutter. The tick for the
 * prompt at the top of the viewport is lit; hovering previews a prompt and
 * clicking scrolls to it. Hidden when the transcript is narrower than 48rem.
 */
export function MessageRail({
  rows,
  listRef,
}: {
  readonly rows: ReadonlyArray<TranscriptRow>;
  readonly listRef: RefObject<LegendListRef | null>;
}) {
  const [selectPrompts] = useState(createPromptSelector);
  const prompts = useMemo(() => selectPrompts(rows), [selectPrompts, rows]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const node = listRef.current?.getScrollableNode();
    if (!node || prompts.length < 2) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const state = listRef.current?.getState();
      if (!state) return;
      const current = prompts.findLast((prompt) => prompt.index <= state.start) ?? prompts[0];
      setActiveIndex(current?.index ?? -1);
    };
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      node.removeEventListener("scroll", onScroll);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [listRef, prompts]);

  if (prompts.length < 2) return null;

  return (
    <nav
      aria-label="Prompts"
      className="no-scrollbar absolute top-1/2 left-2 z-10 hidden max-h-[60%] -translate-y-1/2 flex-col overflow-y-auto py-1 @3xl:flex"
    >
      {prompts.map((prompt) => {
        const active = prompt.index === activeIndex;
        const preview =
          prompt.text.length > PREVIEW_CHARS
            ? `${prompt.text.slice(0, PREVIEW_CHARS).trimEnd()}…`
            : prompt.text;
        return (
          <Tooltip
            key={prompt.id}
            label={<span className="block max-w-72 truncate">{preview || "Prompt"}</span>}
            side="right"
          >
            <button
              type="button"
              aria-label={preview || "Prompt"}
              aria-current={active ? "location" : undefined}
              className="group/tick flex h-3 w-6 shrink-0 items-center outline-none"
              onClick={() =>
                void listRef.current?.scrollToIndex({
                  index: prompt.index,
                  animated: !reducedMotion(),
                  viewOffset: 12,
                })
              }
            >
              <span
                className={cn(
                  "h-px rounded-full transition-[width,background-color] duration-150",
                  active
                    ? "w-4 bg-fg"
                    : "w-2.5 bg-line-strong group-hover/tick:w-4 group-hover/tick:bg-muted",
                )}
              />
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
