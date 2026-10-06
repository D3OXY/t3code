import {
  clampFileAttachmentUploadBytes,
  deletePendingAttachmentUpload,
  fileAttachmentTooLargeMessage,
  runAttachmentUploadCycle,
} from "@t3tools/client-runtime/state/attachments";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES,
  isProviderSendTurnSupportedImageMimeType,
  type ChatAttachment,
  type EnvironmentId,
  type UploadChatAttachment,
} from "@t3tools/contracts";
import * as Option from "effect/Option";

import { attachmentEnvironment, environmentSession, serverEnvironment } from "~/state/atoms";
import { appAtomRegistry } from "~/state/registry";
import {
  patchAttachment,
  readDraftAttachments,
  setDraftAttachments,
  type ComposerAttachment,
} from "~/stores/drafts";
import { randomUUID } from "./ids";

// Composer attachments: validation, image downscaling, eager uploads with
// progress, and conversion into the attachment list a turn sends.

const UPLOAD_TIMEOUT_MS = 120_000;
const MAX_IMAGE_EDGE = 2048;
const QUALITY_STEPS = [0.9, 0.82, 0.72] as const;

/**
 * Validates and adds files to a draft, starting uploads right away. Resolves
 * to a user-facing message for anything it had to reject, or null.
 */
export async function addComposerFiles(
  draftKey: string,
  environmentId: EnvironmentId | null,
  files: ReadonlyArray<File>,
): Promise<string | null> {
  const capabilities = readCapabilities(environmentId);
  const rejected: string[] = [];
  const added: ComposerAttachment[] = [];
  for (const original of files) {
    const prepared = await prepareFile(original, capabilities);
    if (typeof prepared === "string") {
      rejected.push(prepared);
      continue;
    }
    added.push({
      id: randomUUID(),
      kind: prepared.kind,
      file: prepared.file,
      name: prepared.file.name,
      mimeType: prepared.mimeType,
      sizeBytes: prepared.file.size,
      previewUrl: prepared.kind === "image" ? URL.createObjectURL(prepared.file) : null,
      upload:
        capabilities.uploads && environmentId !== null
          ? { status: "uploading", environmentId, progress: 0 }
          : { status: "inline" },
    });
  }
  if (added.length > 0) {
    setDraftAttachments(draftKey, (current) => [...current, ...added]);
    if (capabilities.uploads && environmentId !== null) {
      for (const attachment of added) void startUpload(attachment, environmentId).catch(() => {});
    }
  }
  return rejected.length === 0 ? null : rejected.join(" ");
}

/**
 * The attachment list a turn sends to `environmentId`. Uploads that target
 * another environment (the project changed) or failed are uploaded again;
 * servers without upload support get inline image data URLs. Rejects with a
 * user-facing error when an attachment cannot be delivered.
 */
export async function resolveTurnAttachments(
  environmentId: EnvironmentId,
  attachments: ReadonlyArray<ComposerAttachment>,
): Promise<Array<ChatAttachment | UploadChatAttachment>> {
  const capabilities = readCapabilities(environmentId);
  return Promise.all(
    attachments.map(async (attachment): Promise<ChatAttachment | UploadChatAttachment> => {
      if (!capabilities.uploads) {
        if (attachment.kind !== "image") {
          throw new Error("This environment doesn't accept file attachments.");
        }
        return {
          type: "image",
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          dataUrl: await readAsDataUrl(attachment.file),
        };
      }
      if (attachment.kind === "file" && capabilities.maxFileBytes === null) {
        throw new Error("This environment doesn't accept file attachments.");
      }
      const { upload } = attachment;
      if (upload.status === "ready" && upload.environmentId === environmentId) {
        return toChatAttachment(attachment, upload.attachmentId);
      }
      return startUpload(attachment, environmentId);
    }),
  );
}

/** Retries a failed upload in place. */
export function retryComposerUpload(attachment: ComposerAttachment) {
  if (attachment.upload.status !== "failed") return;
  void startUpload(attachment, attachment.upload.environmentId).catch(() => {});
}

/** Drops an attachment the user removed: aborts its transfer and frees its server copy. */
export function removeComposerAttachment(draftKey: string, id: string) {
  const attachment = readDraftAttachments(draftKey).find((entry) => entry.id === id);
  if (!attachment) return;
  setDraftAttachments(draftKey, (current) => current.filter((entry) => entry.id !== id));
  transfers.get(id)?.abort();
  transfers.delete(id);
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  if (attachment.upload.status === "ready") {
    deletePendingAttachmentUpload({
      registry: appAtomRegistry,
      remove: attachmentEnvironment.remove,
      environmentId: attachment.upload.environmentId,
      attachmentId: attachment.upload.attachmentId,
    });
  }
}

/**
 * Drops attachments a send delivered. Their server copies now belong to the
 * message, so only local resources are released.
 */
export function releaseSentAttachments(
  draftKey: string,
  attachments: ReadonlyArray<ComposerAttachment>,
) {
  const sent = new Set(attachments.map((attachment) => attachment.id));
  setDraftAttachments(draftKey, (current) => current.filter((entry) => !sent.has(entry.id)));
  for (const attachment of attachments) {
    if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
  }
}

// Live transfers by local attachment id, so removal can abort them and a send
// can await the one already in flight.
const transfers = new Map<
  string,
  {
    readonly environmentId: EnvironmentId;
    readonly done: Promise<ChatAttachment>;
    abort: () => void;
  }
>();

/** Uploads one attachment to an environment, reflecting progress in the draft store. */
function startUpload(
  attachment: ComposerAttachment,
  environmentId: EnvironmentId,
): Promise<ChatAttachment> {
  const existing = transfers.get(attachment.id);
  if (existing?.environmentId === environmentId) return existing.done;
  existing?.abort();

  let cancelled = false;
  let abortTransfer = () => {};
  let lastStep = -1;
  patchAttachment(attachment.id, (current) => ({
    ...current,
    upload: { status: "uploading", environmentId, progress: 0 },
  }));
  const done = runAttachmentUploadCycle({
    registry: appAtomRegistry,
    createUploadUrl: attachmentEnvironment.createUploadUrl,
    remove: attachmentEnvironment.remove,
    environmentId,
    upload: uploadInput(attachment),
    resolveUploadUrl: (relativeUrl) => {
      const connection = Option.getOrNull(
        appAtomRegistry.get(environmentSession.preparedConnectionValueAtom(environmentId)),
      );
      return connection ? resolveAssetUrl(connection.httpBaseUrl, relativeUrl) : null;
    },
    transport: (url) =>
      uploadBytes(url, attachment.file, (progress) => {
        // Twenty steps is smooth enough and keeps store writes rare.
        const step = Math.floor(progress * 20);
        if (step === lastStep || cancelled) return;
        lastStep = step;
        patchAttachment(attachment.id, (current) => ({
          ...current,
          upload: { status: "uploading", environmentId, progress },
        }));
      }),
    onMinted: () => (cancelled ? "cancel" : "continue"),
    onTransferStart: (abort) => {
      abortTransfer = abort;
    },
  }).then((result) => {
    if (transfers.get(attachment.id)?.done === done) transfers.delete(attachment.id);
    if (result.status === "uploaded") {
      if (cancelled) {
        deletePendingAttachmentUpload({
          registry: appAtomRegistry,
          remove: attachmentEnvironment.remove,
          environmentId,
          attachmentId: result.attachmentId,
        });
        throw new Error("Upload cancelled");
      }
      patchAttachment(attachment.id, (current) => ({
        ...current,
        upload: { status: "ready", environmentId, attachmentId: result.attachmentId },
      }));
      return toChatAttachment(attachment, result.attachmentId);
    }
    const error =
      result.status === "cancelled"
        ? "Upload cancelled"
        : result.step === "mint"
          ? "Upload could not start"
          : result.step === "resolve-url"
            ? "The environment is not connected"
            : "Upload failed";
    if (!cancelled) {
      patchAttachment(attachment.id, (current) => ({
        ...current,
        upload: { status: "failed", environmentId, error },
      }));
    }
    throw new Error(`'${attachment.name}': ${error.toLowerCase()}.`);
  });
  transfers.set(attachment.id, {
    environmentId,
    done,
    abort: () => {
      cancelled = true;
      abortTransfer();
    },
  });
  return done;
}

function uploadInput(attachment: ComposerAttachment) {
  const base = { name: attachment.name, sizeBytes: attachment.sizeBytes };
  // `prepareFile` only classifies provider-supported image types as images.
  const imageType = PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES.find(
    (type) => type === attachment.mimeType,
  );
  return attachment.kind === "image" && imageType !== undefined
    ? { ...base, mimeType: imageType }
    : { ...base, type: "file" as const, mimeType: attachment.mimeType };
}

const toChatAttachment = (
  attachment: ComposerAttachment,
  attachmentId: string,
): ChatAttachment => ({
  type: attachment.kind,
  id: attachmentId,
  name: attachment.name,
  mimeType: attachment.mimeType,
  sizeBytes: attachment.sizeBytes,
});

function uploadBytes(
  url: string,
  file: File,
  onProgress: (progress: number) => void,
): { readonly done: Promise<void>; readonly abort: () => void } {
  const xhr = new XMLHttpRequest();
  const done = new Promise<void>((resolve, reject) => {
    xhr.open("POST", url, true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    });
    xhr.addEventListener("load", () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload rejected (${xhr.status})`)),
    );
    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(file);
  });
  return { done, abort: () => xhr.abort() };
}

async function prepareFile(
  file: File,
  capabilities: AttachmentCapabilities,
): Promise<
  { readonly kind: "image" | "file"; readonly file: File; readonly mimeType: string } | string
> {
  const name = file.name.trim() || "attachment";
  if (file.size === 0) return `'${name}' is empty.`;
  const mimeType = file.type.toLowerCase();
  if (isProviderSendTurnSupportedImageMimeType(mimeType)) {
    if (file.size <= PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) return { kind: "image", file, mimeType };
    const smaller = await downscaleImage(file, PROVIDER_SEND_TURN_MAX_IMAGE_BYTES);
    return smaller
      ? { kind: "image", file: smaller, mimeType: smaller.type }
      : `'${name}' is too large to attach, even after resizing.`;
  }
  if (capabilities.maxFileBytes === null) {
    return capabilities.uploads
      ? `'${name}' isn't an image this environment accepts.`
      : `This environment only accepts PNG, JPEG, GIF and WebP images.`;
  }
  if (file.size > capabilities.maxFileBytes) {
    return fileAttachmentTooLargeMessage(name, capabilities.maxFileBytes);
  }
  return { kind: "file", file, mimeType: mimeType || "application/octet-stream" };
}

/** Re-encodes an oversized image as JPEG at most 2048px on its long edge until it fits. */
async function downscaleImage(file: File, maxBytes: number): Promise<File | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    for (const edge of [MAX_IMAGE_EDGE, MAX_IMAGE_EDGE * 0.7, MAX_IMAGE_EDGE * 0.5]) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITY_STEPS) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (blob && blob.size <= maxBytes) {
          const name = file.name.replace(/\.[^./\\]+$/, "") || "image";
          return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
        }
      }
    }
    return null;
  } finally {
    bitmap.close();
  }
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Unreadable file")),
    );
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unreadable file")));
    reader.readAsDataURL(file);
  });
}

interface AttachmentCapabilities {
  /** The server takes pre-uploaded bytes; otherwise images go inline as data URLs. */
  readonly uploads: boolean;
  /** Per-file limit for non-image files, or null when only images are accepted. */
  readonly maxFileBytes: number | null;
}

function readCapabilities(environmentId: EnvironmentId | null): AttachmentCapabilities {
  const capabilities =
    environmentId === null
      ? undefined
      : appAtomRegistry.get(serverEnvironment.configValueAtom(environmentId))?.environment
          .capabilities;
  const uploads = capabilities?.attachmentUploads === true;
  return {
    uploads,
    maxFileBytes:
      uploads && capabilities?.fileAttachments
        ? clampFileAttachmentUploadBytes(capabilities.fileAttachments.maxUploadBytes)
        : null,
  };
}
