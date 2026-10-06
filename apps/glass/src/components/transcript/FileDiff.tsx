/* oxlint-disable react/no-array-index-key -- Diff lines have stable positions and may repeat text. */
import { useState } from "react";

import { Button } from "~/components/ui/Button";
import { cn } from "~/lib/cn";
import type { DiffLine } from "./lineDiff";

const INITIAL_LINES = 240;

const SIGN = { add: "+", del: "−", ctx: " ", hunk: "" } as const;

/** A compact colored unified diff. Long diffs show their head with a reveal. */
export function FileDiff({ lines }: { readonly lines: ReadonlyArray<DiffLine> }) {
  const [showAll, setShowAll] = useState(false);
  if (lines.length === 0)
    return <p className="px-3 py-2 text-[12px] text-faint">No line changes.</p>;
  const visible = showAll ? lines : lines.slice(0, INITIAL_LINES);
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-code">
      <div className="overflow-x-auto py-1 font-mono text-[12px] leading-5">
        {visible.map((line, index) =>
          line.kind === "hunk" ? (
            <div key={index} className="px-3 text-faint select-none">
              {line.text || "⋯"}
            </div>
          ) : (
            <div
              key={index}
              className={cn(
                "flex min-w-max pr-3",
                line.kind === "add" && "bg-success/10",
                line.kind === "del" && "bg-danger/10",
              )}
            >
              <span
                className={cn(
                  "w-6 shrink-0 text-center select-none",
                  line.kind === "add"
                    ? "text-success"
                    : line.kind === "del"
                      ? "text-danger"
                      : "text-faint",
                )}
              >
                {SIGN[line.kind]}
              </span>
              <span className="whitespace-pre">{line.text || " "}</span>
            </div>
          ),
        )}
      </div>
      {visible.length < lines.length ? (
        <div className="border-t border-line px-1 py-1">
          <Button size="xs" variant="ghost" onClick={() => setShowAll(true)}>
            Show {lines.length - visible.length} more lines
          </Button>
        </div>
      ) : null}
    </div>
  );
}
