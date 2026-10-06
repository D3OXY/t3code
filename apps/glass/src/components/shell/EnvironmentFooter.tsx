import { useAtomValue } from "@effect/atom-react";
import { connectionStatusTitle } from "@t3tools/client-runtime/connection";
import { Link } from "@tanstack/react-router";
import { Settings } from "lucide-react";

import { cn } from "~/lib/cn";
import { environmentPresentations, primaryEnvironmentIdAtom } from "~/state/atoms";

const PHASE_TONE: Record<string, string> = {
  connected: "bg-success",
  connecting: "bg-warning",
  reconnecting: "bg-warning",
  offline: "bg-faint",
  available: "bg-faint",
  error: "bg-danger",
  unsupported: "bg-danger",
};

/** Bottom of the sidebar: the primary environment and how many others are live. */
export function EnvironmentFooter() {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const primaryId = useAtomValue(primaryEnvironmentIdAtom);
  const all = [...presentations.values()];
  const primary = (primaryId ? presentations.get(primaryId) : undefined) ?? all[0];
  const others = all.filter((presentation) => presentation !== primary);
  const connectedOthers = others.filter(
    (presentation) => presentation.connection.phase === "connected",
  );
  const label = primary?.entry.target.label ?? "Connecting…";

  return (
    <Link
      to="/settings"
      search={{ section: "environments" }}
      className="m-2 flex shrink-0 items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-hover"
      title={primary ? connectionStatusTitle(primary.connection) : undefined}
    >
      <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-fg text-[13px] font-semibold text-bg">
        {label.slice(0, 1).toUpperCase()}
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-surface",
            PHASE_TONE[primary?.connection.phase ?? "connecting"],
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        <span className="block truncate text-[11px] text-faint">
          {primary ? connectionStatusTitle(primary.connection) : "Starting"}
          {others.length > 0 ? ` · ${connectedOthers.length}/${others.length} remote` : ""}
        </span>
      </span>
      <Settings className="size-4 shrink-0 text-faint" />
    </Link>
  );
}
