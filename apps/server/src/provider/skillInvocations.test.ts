import { describe, expect, it } from "vite-plus/test";

import { renderProviderSkillPrompt, resolveProviderSkillInvocations } from "./skillInvocations.ts";

const reviewSkill = {
  name: "review",
  path: "/workspace/.agents/skills/review/SKILL.md",
  enabled: true,
};

describe("resolveProviderSkillInvocations", () => {
  it("resolves only explicit composer selections", () => {
    const prompt = "Use $review, then inspect $HOME/.config.";
    const invocation = { name: "review", start: 4, end: 11 };

    expect(resolveProviderSkillInvocations(prompt, [invocation], [reviewSkill])).toEqual({
      references: [reviewSkill],
      invocations: [invocation],
      unknownNames: [],
      invalidNames: [],
    });
  });

  it("reports unknown, disabled, and invalid explicit invocations", () => {
    expect(
      resolveProviderSkillInvocations(
        "$missing $review",
        [
          { name: "missing", start: 0, end: 8 },
          { name: "review", start: 10, end: 17 },
        ],
        [{ ...reviewSkill, enabled: false }],
      ),
    ).toEqual({
      references: [],
      invocations: [],
      unknownNames: ["missing"],
      invalidNames: ["review"],
    });
  });
});

describe("renderProviderSkillPrompt", () => {
  it("replaces selected ranges and includes the skill location and document", () => {
    const rendered = renderProviderSkillPrompt(
      "Use $review to inspect $HOME.",
      [
        {
          ...reviewSkill,
          contents: "---\nname: review\n---\n\n# Review checklist",
        },
      ],
      [{ name: "review", start: 4, end: 11 }],
    );

    expect(rendered).toContain(
      "file: /workspace/.agents/skills/review/SKILL.md\n---\nname: review\n---\n\n# Review checklist",
    );
    expect(rendered).toContain("Use [T3 explicitly invoked skill: review] to inspect $HOME.");
  });
});
