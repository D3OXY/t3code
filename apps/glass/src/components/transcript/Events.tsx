import {
  formatSubagentDisplayTitle,
  subagentDetailPreview,
} from "@t3tools/client-runtime/state/subagent-display";
import { contextCompactionLabel } from "@t3tools/client-runtime/work-log/presentation";
import type {
  OrchestrationV2TurnItem,
  ProviderApprovalDecision,
  ThreadId,
} from "@t3tools/contracts";
import {
  ArrowUpRight,
  Ban,
  Bot,
  Check,
  ChevronRight,
  CircleAlert,
  GitFork,
  KeyRound,
  ListChecks,
  MessageCircleQuestion,
  Minimize2,
  Repeat,
  ShieldQuestion,
  Sparkles,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "~/components/ui/Button";
import { WorkingCells } from "~/components/ui/WorkingCells";
import { cn } from "~/lib/cn";
import { useOpenThread } from "~/lib/navigation";
import { useDisclosure, useTranscript } from "./context";
import { Markdown } from "./Markdown";
import { providerErrorPresentation } from "./toolEntry";
import { isLive, type ItemOf } from "./turnItem";

/** Thread-level events that render as dividers. */
export function EventDivider({ item }: { readonly item: OrchestrationV2TurnItem }) {
  const { threadRef } = useTranscript();
  switch (item.type) {
    case "compaction":
      return (
        <Divider
          icon={Minimize2}
          label={contextCompactionLabel(item)}
          tone={item.status === "failed" ? "danger" : "muted"}
        />
      );
    case "handoff":
      return (
        <Divider
          icon={Repeat}
          label={item.status === "failed" ? "Handoff failed" : "Handed off"}
          detail={item.toModel ?? item.toProviderInstanceId}
          tone={item.status === "failed" ? "danger" : "muted"}
        />
      );
    case "fork":
      return item.targetThreadId === threadRef.threadId ? (
        <Divider icon={GitFork} label="Forked from here" />
      ) : (
        <Divider
          icon={GitFork}
          label="Forked into a new session"
          action={<OpenThreadLink threadId={item.targetThreadId} />}
        />
      );
    case "thread_created":
      return (
        <Divider
          icon={Sparkles}
          label="Started a session"
          detail={item.targetModel}
          action={
            item.targetThreadId === threadRef.threadId ? null : (
              <OpenThreadLink threadId={item.targetThreadId} />
            )
          }
        />
      );
    case "run_interrupt_request":
      return (
        <Divider
          icon={Ban}
          label="Interrupt requested"
          detail={item.message || null}
          tone="warning"
        />
      );
    case "run_interrupt_result":
      return <Divider icon={Ban} label="Interrupted" detail={item.message || null} />;
    case "system_notice":
      return <Divider icon={TriangleAlert} label={item.message} tone="warning" />;
    case "secret_request":
      return (
        <Divider
          icon={KeyRound}
          label={`Secret requested: ${item.label}`}
          detail={
            item.secretStatus === "pending"
              ? "waiting for you below"
              : item.secretStatus === "saved"
                ? "saved"
                : item.secretStatus
          }
          tone={item.secretStatus === "pending" ? "warning" : "muted"}
        />
      );
    default:
      return (
        <Divider icon={Sparkles} label={item.title?.trim() || item.type.replaceAll("_", " ")} />
      );
  }
}

/** A provider failure: red-tinted, with class, code, retry progress and reset time. */
export function ErrorCard({ item }: { readonly item: ItemOf<"error"> }) {
  const { label, detail } = providerErrorPresentation(item);
  const recovered = item.status === "completed";
  const retrying = item.status === "running";
  const resetAt = item.failure.resetAt ? new Date(item.failure.resetAt) : null;
  return (
    <div className="py-1.5">
      <div
        className={cn(
          "flex gap-2.5 rounded-xl border px-3.5 py-2.5",
          recovered
            ? "border-line bg-hover"
            : retrying || item.failure.class === "usage_limit"
              ? "border-warning/25 bg-warning/8"
              : "border-danger/25 bg-danger/8",
        )}
      >
        {retrying ? (
          <WorkingCells size="sm" className="mt-1 text-warning" />
        ) : recovered ? (
          <Check className="mt-0.5 size-4 shrink-0 text-success" />
        ) : (
          <CircleAlert
            className={cn(
              "mt-0.5 size-4 shrink-0",
              item.failure.class === "usage_limit" ? "text-warning" : "text-danger",
            )}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium">{label}</div>
          <p className="mt-0.5 text-[13px] break-words whitespace-pre-wrap text-muted">{detail}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-faint">
            <span>{item.failure.class.replaceAll("_", " ")}</span>
            {item.failure.code ? <span className="font-mono">{item.failure.code}</span> : null}
            {resetAt && !Number.isNaN(resetAt.getTime()) ? (
              <span>Resets {resetAt.toLocaleString()}</span>
            ) : null}
            {item.failure.retryable === true && !retrying && !recovered ? (
              <span>Retryable</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A proposed plan, rendered in full. Implementing it happens from the composer. */
export function PlanCard({ item }: { readonly item: ItemOf<"proposed_plan"> }) {
  return (
    <div className="py-2">
      <div className="overflow-hidden rounded-xl border border-line bg-raised/40">
        <div className="flex h-9 items-center gap-2 border-b border-line px-3.5 text-[12px] text-muted">
          <ListChecks className="size-3.5" />
          <span className="font-medium text-fg">Plan</span>
          {item.streaming ? <WorkingCells size="xs" className="text-faint" /> : null}
        </div>
        <div className="px-4 py-3">
          <Markdown text={item.markdown} streaming={item.streaming} />
        </div>
      </div>
    </div>
  );
}

/**
 * The record of an approval or question. The interactive panel lives in the
 * composer; here a pending request points there and a resolved one shows the
 * outcome.
 */
export function RequestRecord({
  item,
}: {
  readonly item: ItemOf<"approval_request"> | ItemOf<"user_input_request">;
}) {
  const { requestsById } = useTranscript();
  const request = requestsById.get(item.requestId);
  const pending = request?.status === "pending" || (request === undefined && isLive(item.status));

  if (item.type === "approval_request") {
    const outcome = request?.decision
      ? DECISION_LABELS[request.decision]
      : request?.status === "expired"
        ? "Expired"
        : request?.status === "cancelled" || item.status === "cancelled"
          ? "Cancelled"
          : null;
    const declined = request?.decision === "decline" || request?.decision === "cancel";
    return (
      <div className="flex gap-2.5 py-1.5 text-[13px]">
        <ShieldQuestion
          className={cn("mt-0.5 size-3.5 shrink-0", pending ? "text-warning" : "text-faint")}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-muted">
              {item.appName ?? REQUEST_KIND_LABELS[item.requestKind]}
            </span>
            {pending ? (
              <span className="text-warning">Waiting for your approval below</span>
            ) : outcome ? (
              <span
                className={cn("flex items-center gap-1", declined ? "text-danger" : "text-faint")}
              >
                {declined ? <X className="size-3" /> : <Check className="size-3" />}
                {outcome}
              </span>
            ) : null}
          </div>
          {item.prompt?.trim() ? (
            <p className="mt-0.5 line-clamp-3 font-mono text-[12px] break-words whitespace-pre-wrap text-faint">
              {item.prompt.trim()}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  const answers = item.questionAnswer;
  return (
    <div className="flex gap-2.5 py-1.5 text-[13px]">
      <MessageCircleQuestion
        className={cn("mt-0.5 size-3.5 shrink-0", pending ? "text-warning" : "text-faint")}
      />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-muted">
            {item.questions.length === 1
              ? "Asked a question"
              : `Asked ${item.questions.length} questions`}
          </span>
          {pending ? <span className="text-warning">Waiting for your answer below</span> : null}
          {!pending && !answers && request?.status !== "resolved" ? (
            <span className="text-faint">
              {request?.status === "expired" ? "Expired" : "Not answered"}
            </span>
          ) : null}
        </div>
        {item.questions.map((question) => {
          const answer = answers ? answerText(answers.answers[question.id]) : "";
          return (
            <div key={question.id} className="space-y-0.5">
              <p className="text-faint">
                {answers?.questionTextById?.[question.id] ?? question.question}
              </p>
              {answer ? (
                <p className="border-l border-line-strong pl-2.5 break-words text-fg">{answer}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A subagent's prompt, live progress and result, linking to its own thread. */
export function SubagentCard({ item }: { readonly item: ItemOf<"subagent"> }) {
  const [open, toggle] = useDisclosure(`subagent:${item.id}`);
  const live = isLive(item.status);
  const failed = item.status === "failed";
  const preview = subagentDetailPreview(item);
  return (
    <div className="py-1.5">
      <div className="rounded-xl border border-line bg-hover/50 px-3.5 py-2.5">
        <div className="flex items-center gap-2 text-[13px]">
          <Bot className={cn("size-3.5 shrink-0", failed ? "text-danger" : "text-faint")} />
          <span className="min-w-0 truncate font-medium">
            {formatSubagentDisplayTitle(item.title?.trim() || "Subagent")}
          </span>
          {live ? (
            <WorkingCells size="xs" className="text-faint" />
          ) : failed ? (
            <X className="size-3.5 text-danger" />
          ) : item.status === "completed" ? (
            <Check className="size-3.5 text-success" />
          ) : null}
          <div className="ml-auto flex shrink-0 items-center">
            {item.childThreadId ? (
              <OpenThreadLink threadId={item.childThreadId} label="Open thread" />
            ) : null}
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={open ? "Collapse" : "Expand"}
              aria-expanded={open}
              onClick={toggle}
            >
              <ChevronRight
                className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")}
              />
            </Button>
          </div>
        </div>
        {open ? (
          <div className="mt-2 space-y-2">
            <p className="text-[13px] break-words whitespace-pre-wrap text-muted">{item.prompt}</p>
            {item.progress?.trim() && live ? (
              <p className="text-[12px] text-faint">{item.progress.trim()}</p>
            ) : null}
            {item.result?.trim() ? (
              <div className="border-t border-line pt-2">
                <Markdown text={item.result} className="glass-md-quiet" />
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-1 line-clamp-2 text-[12px] text-faint">{preview ?? item.prompt}</p>
        )}
      </div>
    </div>
  );
}

/** A slim centered marker for thread-level events (compaction, forks, interrupts). */
function Divider({
  icon: Icon,
  label,
  detail,
  tone = "muted",
  action,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly detail?: string | null;
  readonly tone?: "muted" | "warning" | "danger";
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 text-[12px]">
      <div className="h-px flex-1 bg-line" />
      <div
        className={cn(
          "flex max-w-[80%] min-w-0 items-center gap-1.5",
          tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-faint",
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="shrink-0">{label}</span>
        {/* Providers often echo the label as the message ("Interrupt requested"). */}
        {detail && detail.trim().toLowerCase() !== label.trim().toLowerCase() ? (
          <span className="min-w-0 truncate text-faint">· {detail}</span>
        ) : null}
        {action}
      </div>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Opens another thread of this environment as a tab. */
function OpenThreadLink({
  threadId,
  label = "Open",
}: {
  readonly threadId: ThreadId;
  readonly label?: string;
}) {
  const { threadRef } = useTranscript();
  const openThread = useOpenThread();
  return (
    <Button
      size="xs"
      variant="ghost"
      onClick={() => openThread({ environmentId: threadRef.environmentId, threadId })}
    >
      {label}
      <ArrowUpRight className="size-3" />
    </Button>
  );
}

const DECISION_LABELS: Record<ProviderApprovalDecision, string> = {
  accept: "Approved",
  acceptForSession: "Approved for this session",
  acceptAlways: "Always allowed",
  decline: "Declined",
  cancel: "Cancelled",
};

const REQUEST_KIND_LABELS: Record<ItemOf<"approval_request">["requestKind"], string> = {
  command: "Run a command",
  "file-read": "Read a file",
  "file-change": "Change files",
  "mcp-elicitation": "Tool access",
  permission: "Permission",
};

function answerText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(answerText).filter(Boolean).join(", ");
  if (value !== null && typeof value === "object" && "answers" in value)
    return answerText(value.answers);
  return value === undefined || value === null ? "" : JSON.stringify(value);
}
