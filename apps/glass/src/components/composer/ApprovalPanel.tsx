import type { ThreadPendingApproval } from "@t3tools/client-runtime/state/thread-requests";
import type { ProviderApprovalDecision, ProviderApprovalOption } from "@t3tools/contracts";
import { ShieldQuestion, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "~/components/ui/Button";
import { Kbd } from "~/components/ui/Kbd";
import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";

const DEFAULT_OPTIONS: ReadonlyArray<ProviderApprovalOption> = [
  { decision: "decline", label: "Decline" },
  { decision: "acceptForSession", label: "Allow for this session" },
  { decision: "accept", label: "Approve" },
];

const KIND_LABEL: Record<ThreadPendingApproval["requestKind"], string> = {
  command: "Run a command",
  "file-read": "Read a file",
  "file-change": "Change files",
  "mcp-elicitation": "App access",
  permission: "Permission",
};

// Decline first, approve last, so the primary action sits at the right edge.
const DECISION_ORDER: Record<ProviderApprovalDecision, number> = {
  cancel: 0,
  decline: 1,
  acceptForSession: 2,
  acceptAlways: 3,
  accept: 4,
};

/**
 * Replaces the composer while the agent waits on an approval. Enter approves
 * and Esc declines while focus is not in another field. Only live requests can
 * be answered; a request whose provider process is gone explains why not.
 */
export function ApprovalPanel({
  approval,
  pendingCount,
  onRespond,
}: {
  readonly approval: ThreadPendingApproval;
  readonly pendingCount: number;
  readonly onRespond: (decision: ProviderApprovalDecision) => Promise<void>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [responding, setResponding] = useState(false);
  const live = approval.responseCapability === "live";
  const options = [...(approval.options ?? DEFAULT_OPTIONS)].sort(
    (a, b) => DECISION_ORDER[a.decision] - DECISION_ORDER[b.decision],
  );
  const accept = options.find((option) => option.decision === "accept");
  const decline = options.find(
    (option) => option.decision === "decline" || option.decision === "cancel",
  );

  const respond = async (decision: ProviderApprovalDecision) => {
    if (!live || responding) return;
    setResponding(true);
    try {
      await onRespond(decision);
    } finally {
      setResponding(false);
    }
  };

  // Focus the panel so the keyboard shortcuts work right away (it is keyed by request).
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  const onWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (
      target &&
      target !== panelRef.current &&
      target.closest(
        "input, textarea, button, a, select, [contenteditable=true], [role=menu], [role=dialog]",
      )
    ) {
      return;
    }
    if (event.key === "Enter" && accept) {
      event.preventDefault();
      void respond(accept.decision);
    } else if (event.key === "Escape" && decline) {
      event.preventDefault();
      void respond(decline.decision);
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, []);

  const isCode =
    approval.requestKind === "command" ||
    approval.requestKind === "file-change" ||
    approval.requestKind === "file-read";

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-label={`Approval needed: ${KIND_LABEL[approval.requestKind]}`}
      className="glass animate-fade-in rounded-2xl border border-line-strong p-4 shadow-[0_12px_40px_-16px_rgb(0_0_0/0.35)] outline-none"
    >
      <div className="flex items-center gap-2 text-[12.5px]">
        <ShieldQuestion className="size-4 text-warning" />
        <span className="font-medium text-warning">{KIND_LABEL[approval.requestKind]}</span>
        {approval.appName ? <span className="truncate text-muted">{approval.appName}</span> : null}
        {pendingCount > 1 ? (
          <span className="ml-auto text-faint tabular-nums">1/{pendingCount}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "mt-2.5 max-h-40 overflow-auto rounded-xl bg-code px-3 py-2 text-[12.5px] leading-relaxed",
          isCode ? "font-mono whitespace-pre-wrap break-all" : "whitespace-pre-wrap",
        )}
      >
        {live
          ? (approval.detail ?? "The agent is asking for permission to continue.")
          : "The provider process is gone, so this request can't be answered. Stop or restart the run."}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {live ? (
          <span className="mr-auto hidden items-center gap-1.5 text-[11.5px] text-faint sm:flex">
            {accept ? (
              <>
                <Kbd>↵</Kbd> approve
              </>
            ) : null}
            {decline ? (
              <>
                <Kbd>Esc</Kbd> decline
              </>
            ) : null}
          </span>
        ) : null}
        {options.map((option) => {
          const button = (
            <Button
              key={option.decision}
              size="sm"
              variant={
                option.decision === "accept"
                  ? "primary"
                  : option.decision === "decline" || option.decision === "cancel"
                    ? "ghost"
                    : "secondary"
              }
              disabled={!live || responding}
              onClick={() => void respond(option.decision)}
            >
              {option.warning ? <TriangleAlert className="size-3.5 text-warning" /> : null}
              {option.label}
            </Button>
          );
          return option.warning ? (
            <Tooltip key={option.decision} label={option.warning} side="top">
              {button}
            </Tooltip>
          ) : (
            button
          );
        })}
      </div>
    </div>
  );
}
