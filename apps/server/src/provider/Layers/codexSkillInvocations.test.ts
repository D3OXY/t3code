import { describe, expect, it } from "vite-plus/test";

import { bindCodexSkillInvocations } from "./codexSkillInvocations.ts";

const grillWithDocs = {
  name: "grill-with-docs",
  path: "/Users/me/.agents/skills/grill-with-docs/SKILL.md",
  enabled: true,
};

describe("bindCodexSkillInvocations", () => {
  it("attaches a selected skill as structured Codex input", () => {
    expect(
      bindCodexSkillInvocations(
        "Use $grill-with-docs please",
        [{ name: "grill-with-docs", start: 4, end: 20 }],
        [grillWithDocs],
      ),
    ).toEqual({
      ok: true,
      inputs: [{ type: "skill", name: "grill-with-docs", path: grillWithDocs.path }],
    });
  });

  it("allows explicitly selected Codex skills disabled for model invocation", () => {
    expect(
      bindCodexSkillInvocations(
        "$grill-with-docs go",
        [{ name: "grill-with-docs", start: 0, end: 16 }],
        [{ ...grillWithDocs, enabled: false }],
      ),
    ).toEqual({
      ok: true,
      inputs: [{ type: "skill", name: "grill-with-docs", path: grillWithDocs.path }],
    });
  });

  it("does not infer invocations from ordinary dollar text", () => {
    expect(bindCodexSkillInvocations("check $HOME/.config", [], [grillWithDocs])).toEqual({
      ok: true,
      inputs: [],
    });
  });

  it("rejects unknown and stale invocation metadata", () => {
    expect(
      bindCodexSkillInvocations(
        "$missing-skill do this",
        [{ name: "missing-skill", start: 0, end: 14 }],
        [grillWithDocs],
      ),
    ).toEqual({ ok: false, names: ["missing-skill"] });
    expect(
      bindCodexSkillInvocations(
        "$grill-with-docs go",
        [{ name: "grill-with-docs", start: 1, end: 17 }],
        [grillWithDocs],
      ),
    ).toEqual({ ok: false, names: ["grill-with-docs"] });
  });

  it("deduplicates selected skills by path", () => {
    expect(
      bindCodexSkillInvocations(
        "$grill-with-docs then $grill-with-docs",
        [
          { name: "grill-with-docs", start: 0, end: 16 },
          { name: "grill-with-docs", start: 22, end: 38 },
        ],
        [grillWithDocs],
      ),
    ).toEqual({
      ok: true,
      inputs: [{ type: "skill", name: "grill-with-docs", path: grillWithDocs.path }],
    });
  });
});
