import type { FileDiffMetadata } from "@pierre/diffs/types";
import { parsePatchFiles } from "@pierre/diffs/utils/parsePatchFiles";
import { unquoteGitPatchPath } from "@t3tools/shared/gitPatchPath";

export type ParsedDiff =
  | {
      readonly kind: "files";
      readonly files: ReadonlyArray<FileDiffMetadata>;
      readonly additions: number;
      readonly deletions: number;
    }
  | { readonly kind: "raw"; readonly text: string; readonly reason: string };

/** FNV-1a; cheap identity for patches (worker cache keys) and viewer item versions. */
export function fnv1a(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Parses a unified git patch into Pierre file diffs plus line totals. Returns
 * null for an empty patch and a raw fallback when the format is unsupported.
 */
export function parseDiff(patch: string | null | undefined, scope: string): ParsedDiff | null {
  const text = patch?.trim() ?? "";
  if (text.length === 0) return null;
  try {
    const cacheKey = `glass:${scope}:${text.length}:${fnv1a(text).toString(36)}:${fnv1a(text, 0x9e3779b9).toString(36)}`;
    const files = parsePatchFiles(text, cacheKey).flatMap((parsed) => parsed.files);
    if (files.length === 0) {
      return { kind: "raw", text, reason: "Unsupported diff format. Showing the raw patch." };
    }
    let additions = 0;
    let deletions = 0;
    for (const file of files) {
      for (const hunk of file.hunks) {
        additions += hunk.additionLines;
        deletions += hunk.deletionLines;
      }
    }
    return { kind: "files", files, additions, deletions };
  } catch {
    return { kind: "raw", text, reason: "Couldn't parse this patch. Showing it raw." };
  }
}

/** The file's real path; git quotes and escapes unusual names in patches. */
export const fileDiffPath = (file: FileDiffMetadata) =>
  unquoteGitPatchPath(file.name ?? file.prevName ?? "");

/**
 * Stable per file block across re-renders. A type change (file to symlink)
 * arrives as a delete plus an add of the same path, so the type is included.
 */
export const fileDiffKey = (file: FileDiffMetadata) =>
  `${file.prevName ?? ""}\u0000${file.name}\u0000${file.type}`;
