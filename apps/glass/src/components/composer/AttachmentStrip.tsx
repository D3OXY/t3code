import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import { FileText, RotateCw, X } from "lucide-react";

import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import type { ComposerAttachment } from "~/stores/drafts";
import { removeComposerAttachment, retryComposerUpload } from "./attachments";

/** Thumbnails and file chips above the prompt, with upload progress, retry and remove. */
export function AttachmentStrip({
  draftKey,
  attachments,
  sendingIds,
}: {
  readonly draftKey: string;
  readonly attachments: ReadonlyArray<ComposerAttachment>;
  readonly sendingIds: ReadonlySet<string>;
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto px-3 pt-3 no-scrollbar" aria-label="Attachments">
      {attachments.map((attachment) => (
        <AttachmentTile
          key={attachment.id}
          attachment={attachment}
          sending={sendingIds.has(attachment.id)}
          onRemove={() => removeComposerAttachment(draftKey, attachment.id)}
        />
      ))}
    </div>
  );
}

function AttachmentTile({
  attachment,
  sending,
  onRemove,
}: {
  readonly attachment: ComposerAttachment;
  readonly sending: boolean;
  readonly onRemove: () => void;
}) {
  const { upload } = attachment;
  const failed = upload.status === "failed";
  const title = failed ? `${attachment.name} · ${upload.error}` : attachment.name;
  return (
    <Tooltip label={title} side="top">
      <div
        className={cn(
          "group relative h-14 shrink-0 overflow-hidden rounded-xl border bg-hover transition-opacity duration-150",
          attachment.previewUrl ? "w-14" : "flex w-44 items-center gap-2 px-2.5",
          failed ? "border-danger/50" : "border-line",
          sending && "opacity-50",
        )}
      >
        {attachment.previewUrl ? (
          <img
            src={attachment.previewUrl}
            alt={attachment.name}
            className="size-full object-cover"
            draggable={false}
          />
        ) : (
          <>
            <FileText className="size-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium">{attachment.name}</span>
              <span className="block truncate text-[11px] text-faint">
                {failed ? upload.error : formatAttachmentSize(attachment.sizeBytes)}
              </span>
            </span>
          </>
        )}
        {upload.status === "uploading" ? (
          <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-black/25">
            <span
              className="block h-full rounded-full bg-white transition-[width] duration-200 ease-out"
              style={{ width: `${Math.max(6, Math.round(upload.progress * 100))}%` }}
            />
          </span>
        ) : null}
        {failed ? (
          <button
            type="button"
            aria-label={`Retry uploading ${attachment.name}`}
            onClick={() => retryComposerUpload(attachment)}
            className={cn(
              "absolute grid place-items-center text-danger outline-none",
              attachment.previewUrl
                ? "inset-0 bg-danger/25 text-white"
                : "top-1/2 right-7 size-5 -translate-y-1/2 rounded-md hover:bg-danger/15",
            )}
          >
            <RotateCw className="size-3.5" />
          </button>
        ) : null}
        {sending ? null : (
          <button
            type="button"
            aria-label={`Remove ${attachment.name}`}
            onClick={onRemove}
            className="absolute top-1 right-1 grid size-5 place-items-center rounded-full bg-black/55 text-white opacity-0 outline-none group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
    </Tooltip>
  );
}
