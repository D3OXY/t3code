import type { ThreadRuntimeSummary } from "@t3tools/client-runtime/state/shell";

import { WorkingCells } from "~/components/ui/WorkingCells";
import { elapsed } from "~/lib/format";
import { useNow } from "~/lib/useNow";

const WORDS = [
  "Thinking",
  "Working",
  "Pondering",
  "Tinkering",
  "Reasoning",
  "Exploring",
  "Considering",
  "Composing",
  "Untangling",
  "Sketching",
  "Assembling",
  "Iterating",
  "Mulling it over",
  "Connecting dots",
  "Investigating",
  "Piecing it together",
  "Refining",
  "Calibrating",
  "Charting a path",
  "Weighing options",
];

const WORD_PERIOD_MS = 7_000;

/** A small stable hash so each run starts on its own word. */
function seedOf(text: string): number {
  let hash = 0;
  for (let index = 0; index < text.length; index++) hash = (hash * 31 + text.charCodeAt(index)) | 0;
  return Math.abs(hash);
}

function statusLabel(status: ThreadRuntimeSummary["status"], word: string): string {
  switch (status) {
    case "preparing":
    case "queued":
    case "starting":
      return "Starting";
    case "waiting":
      return "Waiting for you";
    default:
      return word;
  }
}

/**
 * The live tail of a running thread: the matrix spinner, a flavour word that
 * rotates every few seconds, and the elapsed time. Only this row ticks.
 */
export function WorkingRow({
  status,
  startedAt,
  seed,
}: {
  readonly status: ThreadRuntimeSummary["status"];
  readonly startedAt: string | null;
  readonly seed: string;
}) {
  const now = useNow(1000);
  const word = WORDS[(seedOf(seed) + Math.floor(now / WORD_PERIOD_MS)) % WORDS.length]!;
  return (
    <div
      className="animate-fade-quick flex h-8 items-center gap-2.5 text-[13px] text-muted"
      role="status"
    >
      <WorkingCells size="sm" />
      <span>{statusLabel(status, word)}…</span>
      {startedAt ? (
        <span className="text-faint tabular-nums">{elapsed(startedAt, now)}</span>
      ) : null}
    </div>
  );
}
