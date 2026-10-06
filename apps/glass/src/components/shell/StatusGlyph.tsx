import { Check, Clock3 } from "lucide-react";

import { WorkingCells } from "~/components/ui/WorkingCells";
import { cn } from "~/lib/cn";
import type { SessionStatus } from "~/state/sessions";

const LABELS: Partial<Record<SessionStatus, string>> = {
  approval: "Approval",
  input: "Input",
  failed: "Failed",
  limited: "Limited",
  plan: "Plan ready",
  waiting: "Waiting",
  done: "Done",
};

const TONES: Partial<Record<SessionStatus, string>> = {
  approval: "text-warning",
  input: "text-info",
  failed: "text-danger",
  limited: "text-warning",
  plan: "text-accent",
  waiting: "text-muted",
  done: "text-success",
};

/** The trailing status of a session row; falls back to the age label when idle. */
export function StatusGlyph({
  status,
  age,
}: {
  readonly status: SessionStatus;
  readonly age: string;
}) {
  if (status === "working") {
    return <WorkingCells size="xs" className="text-fg/80" />;
  }
  const label = LABELS[status];
  if (!label) return <span className="text-[11px] text-faint tabular-nums">{age}</span>;
  return (
    <span className={cn("flex items-center gap-1 text-[11px] font-medium", TONES[status])}>
      {status === "done" ? (
        <Check className="size-3" strokeWidth={2.5} />
      ) : status === "waiting" ? (
        <Clock3 className="size-3" />
      ) : (
        <span className="size-1.5 rounded-full bg-current" />
      )}
      {label}
    </span>
  );
}

/** A bare status dot for dense places like tabs and the agent pill. */
export function StatusDot({ status }: { readonly status: SessionStatus }) {
  if (status === "working") return <WorkingCells size="xs" className="text-fg/70" />;
  const tone = TONES[status];
  if (!tone) return null;
  return <span className={cn("size-1.5 shrink-0 rounded-full bg-current", tone)} />;
}
