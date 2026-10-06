import { describe, expect, it } from "vite-plus/test";

import { countDiffLines, diffTexts, parseUnifiedDiff } from "./lineDiff";

const render = (lines: ReturnType<typeof diffTexts>) =>
  lines.map((line) => `${{ add: "+", del: "-", ctx: " ", hunk: "@" }[line.kind]}${line.text}`);

describe("parseUnifiedDiff", () => {
  it("drops file headers and reads +/- lines", () => {
    const lines = parseUnifiedDiff(
      ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -1,2 +1,2 @@", " keep", "-old", "+new"].join(
        "\n",
      ),
    );
    expect(render(lines)).toEqual([" keep", "-old", "+new"]);
  });

  it("keeps hunk separators between several hunks", () => {
    const lines = parseUnifiedDiff(
      ["@@ -1 +1 @@", "-a", "+b", "@@ -9 +9 @@", "-c", "+d"].join("\n"),
    );
    expect(lines.filter((line) => line.kind === "hunk")).toHaveLength(2);
    expect(countDiffLines(lines)).toEqual({ additions: 2, deletions: 2 });
  });
});

describe("diffTexts", () => {
  it("diffs changed lines with surrounding context", () => {
    expect(render(diffTexts("a\nb\nc\n", "a\nB\nc\n"))).toEqual([" a", "-b", "+B", " c"]);
  });

  it("collapses distant unchanged regions into a hunk separator", () => {
    const before = Array.from({ length: 20 }, (_, index) => `line ${index}`);
    const after = [...before];
    after[1] = "changed 1";
    after[18] = "changed 18";
    const lines = diffTexts(before.join("\n"), after.join("\n"));
    expect(lines.filter((line) => line.kind === "hunk")).toHaveLength(1);
    expect(countDiffLines(lines)).toEqual({ additions: 2, deletions: 2 });
  });

  it("treats a new file as all additions", () => {
    expect(render(diffTexts("", "x\ny"))).toEqual(["+x", "+y"]);
  });
});
