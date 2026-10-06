import { useAtomValue } from "@effect/atom-react";
import {
  assetUrlStateFromResult,
  EMPTY_ASSET_URL_ATOM,
  type AssetUrlState,
} from "@t3tools/client-runtime/state/assets";
import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import type { AssetResource, ChatAttachment, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { FileText, ImageOff } from "lucide-react";
import { useState } from "react";

import { Dialog, DialogPopup } from "~/components/ui/Dialog";
import { Tooltip } from "~/components/ui/Tooltip";
import { cn } from "~/lib/cn";
import { assetEnvironment, environmentSession } from "~/state/atoms";

/** Resolves an environment asset to a signed, absolute URL. Refreshes before it expires. */
export function useAssetUrl(
  environmentId: EnvironmentId,
  resource: AssetResource | null,
): AssetUrlState {
  const connection = useAtomValue(environmentSession.preparedConnectionValueAtom(environmentId));
  const result = useAtomValue(
    resource === null
      ? EMPTY_ASSET_URL_ATOM
      : assetEnvironment.createUrl({ environmentId, input: { resource } }),
  );
  return assetUrlStateFromResult(result, Option.getOrNull(connection)?.httpBaseUrl ?? null);
}

export interface PreviewImage {
  readonly src: string;
  readonly alt: string;
}

/** A full-size view of one image. Closing returns focus to the thumbnail. */
export function ImageLightbox({
  image,
  onClose,
}: {
  readonly image: PreviewImage | null;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open={image !== null} onOpenChange={(open) => !open && onClose()}>
      {image ? (
        <DialogPopup size="auto" className="overflow-hidden">
          <img
            src={image.src}
            alt={image.alt}
            className="block max-h-[86vh] max-w-full object-contain"
          />
        </DialogPopup>
      ) : null}
    </Dialog>
  );
}

/** A clickable image thumbnail for any asset resource. */
export function AssetThumbnail({
  environmentId,
  resource,
  alt,
  className,
  onOpen,
}: {
  readonly environmentId: EnvironmentId;
  readonly resource: AssetResource;
  readonly alt: string;
  readonly className?: string;
  readonly onOpen: (image: PreviewImage) => void;
}) {
  const url = useAssetUrl(environmentId, resource);
  const frame = cn(
    "relative grid shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-sunken",
    className,
  );
  if (url._tag === "Failure") {
    return (
      <Tooltip label={`${alt} is unavailable`}>
        <div className={frame} role="img" aria-label={`${alt} is unavailable`}>
          <ImageOff className="size-4 text-faint" />
        </div>
      </Tooltip>
    );
  }
  if (url._tag === "Loading") return <div className={frame} aria-label={alt} />;
  return (
    <button
      type="button"
      className={cn(
        frame,
        "cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
      )}
      onClick={() => onOpen({ src: url.url, alt })}
    >
      <img
        src={url.url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
      />
    </button>
  );
}

function FileChip({
  environmentId,
  attachment,
}: {
  readonly environmentId: EnvironmentId;
  readonly attachment: ChatAttachment;
}) {
  const url = useAssetUrl(environmentId, {
    _tag: "attachment",
    attachmentId: attachment.id,
    fileName: attachment.name,
    mimeType: attachment.mimeType,
    disposition: "attachment",
  });
  const href = url._tag === "Success" ? url.url : undefined;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-disabled={href === undefined}
      className="flex max-w-64 items-center gap-2 rounded-xl border border-line bg-hover px-2.5 py-1.5 text-[12px] hover:bg-active"
    >
      <FileText className="size-3.5 shrink-0 text-muted" />
      <span className="min-w-0 truncate">{attachment.name}</span>
      <span className="shrink-0 text-faint">{formatAttachmentSize(attachment.sizeBytes)}</span>
    </a>
  );
}

/** Image thumbnails and file chips for a message's attachments, with a lightbox. */
export function AttachmentStrip({
  environmentId,
  attachments,
  align,
}: {
  readonly environmentId: EnvironmentId;
  readonly attachments: ReadonlyArray<ChatAttachment>;
  readonly align: "start" | "end";
}) {
  const [preview, setPreview] = useState<PreviewImage | null>(null);
  if (attachments.length === 0) return null;
  return (
    <div
      className={cn(
        "flex max-w-[80%] flex-wrap gap-1.5",
        align === "end" ? "justify-end" : "justify-start",
      )}
    >
      {attachments.map((attachment) =>
        attachment.type === "image" ? (
          <AssetThumbnail
            key={attachment.id}
            environmentId={environmentId}
            resource={{ _tag: "attachment", attachmentId: attachment.id }}
            alt={attachment.name}
            className="size-24"
            onOpen={setPreview}
          />
        ) : (
          <FileChip key={attachment.id} environmentId={environmentId} attachment={attachment} />
        ),
      )}
      <ImageLightbox image={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
