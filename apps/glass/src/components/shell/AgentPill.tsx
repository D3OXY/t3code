import { useAtomValue } from "@effect/atom-react";
import { Bell, ChevronUp } from "lucide-react";
import { useMemo } from "react";

import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/Popover";
import { ProviderIcon, useProviderInstance } from "~/components/ui/ProviderIcon";
import { cn } from "~/lib/cn";
import { relativeAge } from "~/lib/format";
import { useOpenThread } from "~/lib/navigation";
import { useNow } from "~/lib/useNow";
import { sessionRowsAtom, sortSessionsByAttention, type SessionRow } from "~/state/sessions";
import { StatusGlyph } from "./StatusGlyph";

/** Sessions with something to report: blocked, failed, running, or finished unseen. */
function useAgentUpdates() {
  const rows = useAtomValue(sessionRowsAtom);
  return useMemo(() => {
    const updates = sortSessionsByAttention(rows.filter((row) => row.status !== "idle"));
    const environments = new Set(updates.map((row) => row.shell.environmentId));
    return { updates, environmentCount: environments.size };
  }, [rows]);
}

/** Floating pill at the bottom of the canvas: "N agent updates · M environments". */
export function AgentPill() {
  const { updates, environmentCount } = useAgentUpdates();
  if (updates.length === 0) return null;
  const providers = [
    ...new Map(updates.map((row) => [row.shell.modelSelection.instanceId, row])).values(),
  ].slice(0, 3);
  return (
    <Popover>
      <PopoverTrigger className="glass animate-fade-in pointer-events-auto flex h-10 items-center gap-2.5 rounded-full border border-line-strong pr-3 pl-2.5 text-[13px] font-medium shadow-pop outline-none hover:brightness-105">
        <span className="flex -space-x-1">
          {providers.map((row) => (
            <PillProviderIcon key={row.key} row={row} />
          ))}
        </span>
        <span>
          {updates.length} agent {updates.length === 1 ? "update" : "updates"}
          {environmentCount > 1 ? ` · ${environmentCount} environments` : ""}
        </span>
        <ChevronUp className="size-3.5 text-muted" />
      </PopoverTrigger>
      <PopoverPopup side="top" align="center" className="w-[min(26rem,calc(100vw-2rem))]">
        <UpdatesList updates={updates} />
      </PopoverPopup>
    </Popover>
  );
}

/** The same list behind a compact bell in the thread title bar. */
export function AgentUpdatesButton() {
  const { updates } = useAgentUpdates();
  const attention = updates.filter(
    (row) => row.status !== "working" && row.status !== "waiting",
  ).length;
  if (updates.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger
        aria-label={`${updates.length} agent ${updates.length === 1 ? "update" : "updates"}`}
        className="relative flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted outline-none hover:bg-hover hover:text-fg"
      >
        <Bell className="size-3.5" />
        {updates.length}
        {attention > 0 ? (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-accent" />
        ) : null}
      </PopoverTrigger>
      <PopoverPopup align="end" className="w-[min(26rem,calc(100vw-2rem))]">
        <UpdatesList updates={updates} />
      </PopoverPopup>
    </Popover>
  );
}

function PillProviderIcon({ row }: { readonly row: SessionRow }) {
  const provider = useProviderInstance(
    row.shell.environmentId,
    row.shell.modelSelection.instanceId,
  );
  return (
    <span className="grid size-6 place-items-center rounded-full bg-raised ring-2 ring-surface">
      <ProviderIcon provider={provider} size="sm" />
    </span>
  );
}

function UpdatesList({ updates }: { readonly updates: ReadonlyArray<SessionRow> }) {
  const openThread = useOpenThread();
  const now = useNow();
  return (
    <div className="max-h-[min(28rem,60vh)] overflow-y-auto p-1.5">
      <div className="px-2 pt-1 pb-2 text-[11.5px] font-medium text-faint">Agent updates</div>
      {updates.map((row) => (
        <button
          key={row.key}
          type="button"
          onClick={() =>
            openThread({ environmentId: row.shell.environmentId, threadId: row.shell.id })
          }
          className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-hover"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11px] text-faint">
              {row.project?.title ?? "Project"} @ {row.environmentLabel}
            </span>
            <span className={cn("block truncate text-[13px]", row.unread && "font-semibold")}>
              {row.shell.title}
            </span>
          </span>
          <StatusGlyph status={row.status} age={relativeAge(row.activityAt, now)} />
        </button>
      ))}
    </div>
  );
}
