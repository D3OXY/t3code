import { describe, expect, it } from "vite-plus/test";

import {
  buildQuestionAnswers,
  firstUnansweredQuestionIndex,
  resolveQuestionAnswer,
  setQuestionCustomAnswer,
  toggleQuestionOption,
} from "./pendingUserInput";

const single = {
  id: "scope",
  multiSelect: false,
  options: [
    { label: "Small", description: "One file" },
    { label: "Large", description: "Many files", value: "large " },
  ],
};
const multi = {
  id: "targets",
  multiSelect: true,
  options: [
    { label: "Web", description: "Browser" },
    { label: "Mobile", description: "Phones" },
  ],
};

describe("resolveQuestionAnswer", () => {
  it("answers with an option's explicit value, untrimmed", () => {
    expect(resolveQuestionAnswer(single, toggleQuestionOption(single, undefined, "large "))).toBe(
      "large ",
    );
  });

  it("lets a custom answer outrank selected options", () => {
    const draft = setQuestionCustomAnswer({ selectedOptionValues: ["Small"] }, "  Medium ");
    expect(resolveQuestionAnswer(single, draft)).toBe("Medium");
  });

  it("ignores custom answers when the question forbids them", () => {
    const question = { ...single, allowCustomAnswer: false };
    expect(resolveQuestionAnswer(question, { customAnswer: "Other" })).toBeNull();
  });

  it("drops selections that are not options", () => {
    expect(resolveQuestionAnswer(single, { selectedOptionValues: ["Gone"] })).toBeNull();
  });
});

describe("toggleQuestionOption", () => {
  it("replaces the choice for single-select", () => {
    const first = toggleQuestionOption(single, undefined, "Small");
    expect(toggleQuestionOption(single, first, "large ").selectedOptionValues).toEqual(["large "]);
  });

  it("toggles choices for multi-select and clears the custom answer", () => {
    const one = toggleQuestionOption(multi, { customAnswer: "x" }, "Web");
    const two = toggleQuestionOption(multi, one, "Mobile");
    expect(two).toEqual({ customAnswer: "", selectedOptionValues: ["Web", "Mobile"] });
    expect(resolveQuestionAnswer(multi, toggleQuestionOption(multi, two, "Web"))).toEqual([
      "Mobile",
    ]);
  });

  it("restores selections when a custom answer is cleared", () => {
    const typed = setQuestionCustomAnswer({ selectedOptionValues: ["Web"] }, "");
    expect(typed.selectedOptionValues).toEqual(["Web"]);
  });
});

describe("buildQuestionAnswers", () => {
  it("is null until every question is answered", () => {
    const drafts = { scope: { selectedOptionValues: ["Small"] } };
    expect(buildQuestionAnswers([single, multi], drafts)).toBeNull();
    expect(firstUnansweredQuestionIndex([single, multi], drafts)).toBe(1);
  });

  it("maps question ids to answers", () => {
    const drafts = {
      scope: { selectedOptionValues: ["Small"] },
      targets: { selectedOptionValues: ["Web", "Mobile"] },
    };
    expect(buildQuestionAnswers([single, multi], drafts)).toEqual({
      scope: "Small",
      targets: ["Web", "Mobile"],
    });
    expect(firstUnansweredQuestionIndex([single, multi], drafts)).toBe(1);
  });
});
