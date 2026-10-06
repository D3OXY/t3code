import { resolveUserMessagePresentation } from "@t3tools/client-runtime/user-message";
import type { OrchestrationV2ProjectedTurnItem, OrchestrationV2TurnItem } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import { Button } from "~/components/ui/Button";
import { cn } from "~/lib/cn";
import { AttachmentStrip } from "./Attachments";
import { useDisclosure, useTranscript } from "./context";
import { CopyButton } from "./CopyButton";
import { Markdown } from "./Markdown";

type UserItem = Extract<OrchestrationV2TurnItem, { type: "user_message" }>;
type AssistantItem = Extract<OrchestrationV2TurnItem, { type: "assistant_message" }>;

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "3:41 PM" today, "Oct 2, 3:41 PM" otherwise. */
function messageTime(at: DateTime.Utc): string {
  const date = new Date(DateTime.toEpochMillis(at));
  return date.toDateString() === new Date().toDateString()
    ? timeFormat.format(date)
    : dateTimeFormat.format(date);
}

const INTENT_LABELS: Partial<Record<UserItem["inputIntent"], string>> = {
  steer: "Steered",
  promoted_queued_to_steer: "Steered",
  queued_turn: "Queued",
};

const shouldClamp = (text: string) => text.length > 1600 || text.split("\n", 20).length >= 20;

/** The user's prompt: a right-aligned bubble with attachments and hover metadata. */
export function UserMessage({
  row,
  item,
}: {
  readonly row: OrchestrationV2ProjectedTurnItem;
  readonly item: UserItem;
}) {
  const { threadRef } = useTranscript();
  const [expanded, toggleExpanded] = useDisclosure(`user:${item.id}`);
  const presentation = resolveUserMessagePresentation({
    id: item.messageId,
    role: "user",
    text: item.text,
    createdBy: item.createdBy,
    ...(item.scheduledTaskId === undefined ? {} : { scheduledTaskId: item.scheduledTaskId }),
  });
  const text = presentation.text.trim();
  const clamp = shouldClamp(text);
  const tag = presentation.isAutomation
    ? "Scheduled"
    : item.createdBy === "agent"
      ? "From an agent"
      : INTENT_LABELS[item.inputIntent];

  return (
    <div
      className={cn(
        "group/user flex flex-col items-end gap-1.5 pt-5 pb-1",
        row.visibility === "inherited" && "opacity-60",
      )}
    >
      <AttachmentStrip
        environmentId={threadRef.environmentId}
        attachments={item.attachments}
        align="end"
      />
      {text ? (
        <div className="max-w-[80%] rounded-2xl bg-bubble px-3.5 py-2 text-[14px] leading-relaxed break-words whitespace-pre-wrap">
          <div className={cn(clamp && !expanded && "transcript-clamp")}>{text}</div>
          {clamp ? (
            <Button size="xs" variant="ghost" className="-mx-2 mt-1" onClick={toggleExpanded}>
              {expanded ? "Show less" : "Show more"}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex h-6 items-center gap-1 text-[11px] text-faint opacity-0 transition-opacity duration-150 group-hover/user:opacity-100 focus-within:opacity-100">
        {tag ? <span>{tag} ·</span> : null}
        <time dateTime={DateTime.formatIso(item.startedAt ?? item.updatedAt)}>
          {messageTime(item.startedAt ?? item.updatedAt)}
        </time>
        {text ? <CopyButton text={text} label="Copy message" /> : null}
      </div>
    </div>
  );
}

/** The agent's answer: full-width markdown with a copy action once it settles. */
export function AssistantMessage({
  row,
  item,
}: {
  readonly row: OrchestrationV2ProjectedTurnItem;
  readonly item: AssistantItem;
}) {
  const { threadRef } = useTranscript();
  const text = item.text.trim();
  return (
    <div className={cn("group/assistant py-1", row.visibility === "inherited" && "opacity-60")}>
      {text ? <Markdown text={item.text} streaming={item.streaming} /> : null}
      {item.attachments?.length ? (
        <div className="mt-2">
          <AttachmentStrip
            environmentId={threadRef.environmentId}
            attachments={item.attachments}
            align="start"
          />
        </div>
      ) : null}
      {/* Reserved while streaming so settling never shifts the transcript. */}
      {text ? (
        <div className="-ml-1.5 flex h-7 items-center opacity-0 transition-opacity duration-150 group-hover/assistant:opacity-100 focus-within:opacity-100">
          {item.streaming ? null : <CopyButton text={item.text} label="Copy response" />}
        </div>
      ) : null}
    </div>
  );
}
