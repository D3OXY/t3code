/** One rendered line of a compact unified diff. `hunk` separates non-adjacent regions. */
export interface DiffLine {
  readonly kind: "add" | "del" | "ctx" | "hunk";
  readonly text: string;
}

const CONTEXT_LINES = 3;
/** Above this many LCS cells the diff degrades to "all removed, all added". */
const MAX_LCS_CELLS = 400_000;

const HEADER_PREFIXES = [
  "diff --git",
  "index ",
  "--- ",
  "+++ ",
  "new file mode",
  "deleted file mode",
  "old mode",
  "new mode",
  "similarity index",
  "rename from",
  "rename to",
  "Binary files",
];

/**
 * Parses unified diff text (as providers report it in `diffStr`) into lines.
 * File headers are dropped; `@@` headers become hunk separators. Text without
 * any hunk header is read line by line on its +/- prefixes.
 */
export function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  for (const line of splitLines(diff)) {
    if (line.startsWith("@@")) {
      lines.push({ kind: "hunk", text: line });
    } else if (line.startsWith("\\ ")) {
      continue; // "\ No newline at end of file"
    } else if (HEADER_PREFIXES.some((prefix) => line.startsWith(prefix))) {
      continue;
    } else if (line.startsWith("+")) {
      lines.push({ kind: "add", text: line.slice(1) });
    } else if (line.startsWith("-")) {
      lines.push({ kind: "del", text: line.slice(1) });
    } else {
      lines.push({ kind: "ctx", text: line.startsWith(" ") ? line.slice(1) : line });
    }
  }
  // A leading separator says nothing when it is the only hunk.
  if (lines[0]?.kind === "hunk" && !lines.slice(1).some((line) => line.kind === "hunk")) {
    lines.shift();
  }
  return lines;
}

/** A compact unified diff between two texts, as file_change items report `oldStr`/`newStr`. */
export function diffTexts(oldText: string, newText: string): DiffLine[] {
  const before = splitLines(oldText);
  const after = splitLines(newText);
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  ) {
    end++;
  }
  const middle = diffMiddle(
    before.slice(start, before.length - end),
    after.slice(start, after.length - end),
  );
  return compact([
    ...before.slice(0, start).map((text): DiffLine => ({ kind: "ctx", text })),
    ...middle,
    ...before.slice(before.length - end).map((text): DiffLine => ({ kind: "ctx", text })),
  ]);
}

/** Added and removed line counts, for items that do not report their own. */
export function countDiffLines(lines: ReadonlyArray<DiffLine>) {
  let additions = 0;
  let deletions = 0;
  for (const line of lines) {
    if (line.kind === "add") additions++;
    else if (line.kind === "del") deletions++;
  }
  return { additions, deletions };
}

function splitLines(text: string): string[] {
  return text === "" ? [] : text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

/** Line-level LCS diff of the middle section, after common prefix/suffix are trimmed. */
function diffMiddle(before: ReadonlyArray<string>, after: ReadonlyArray<string>): DiffLine[] {
  const rows = before.length;
  const cols = after.length;
  if (rows === 0 || cols === 0 || rows * cols > MAX_LCS_CELLS) {
    return [
      ...before.map((text): DiffLine => ({ kind: "del", text })),
      ...after.map((text): DiffLine => ({ kind: "add", text })),
    ];
  }
  // lengths[i * (cols + 1) + j] = LCS length of before[i:] and after[j:].
  const width = cols + 1;
  const lengths = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lengths[i * width + j] =
        before[i] === after[j]
          ? lengths[(i + 1) * width + j + 1]! + 1
          : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      out.push({ kind: "ctx", text: before[i]! });
      i++;
      j++;
    } else if (lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!) {
      out.push({ kind: "del", text: before[i]! });
      i++;
    } else {
      out.push({ kind: "add", text: after[j]! });
      j++;
    }
  }
  while (i < rows) out.push({ kind: "del", text: before[i++]! });
  while (j < cols) out.push({ kind: "add", text: after[j++]! });
  return out;
}

/** Keeps changed lines plus a little context, separating distant regions with hunks. */
function compact(lines: ReadonlyArray<DiffLine>): DiffLine[] {
  const keep = new Uint8Array(lines.length);
  lines.forEach((line, index) => {
    if (line.kind === "ctx") return;
    const from = Math.max(0, index - CONTEXT_LINES);
    const to = Math.min(lines.length - 1, index + CONTEXT_LINES);
    for (let k = from; k <= to; k++) keep[k] = 1;
  });
  const out: DiffLine[] = [];
  let skipped = false;
  lines.forEach((line, index) => {
    if (!keep[index]) {
      skipped = true;
      return;
    }
    if (skipped && out.length > 0) out.push({ kind: "hunk", text: "" });
    skipped = false;
    out.push(line);
  });
  return out;
}
