import { describe, expect, it } from "@effect/vitest";

import {
  remapExplicitSkillInvocations,
  updateExplicitSkillInvocationsForTextEdit,
} from "./explicitSkillInvocations.ts";

describe("explicit skill invocation ranges", () => {
  it("remaps ranges through trimming and an outgoing prefix", () => {
    expect(
      remapExplicitSkillInvocations({
        sourceText: "  $review this  ",
        outgoingText: "Think carefully.\n\n$review this",
        invocations: [{ name: "review", start: 2, end: 9 }],
      }),
    ).toEqual([{ name: "review", start: 18, end: 25 }]);
  });

  it("drops stale ranges instead of invoking matching names elsewhere", () => {
    expect(
      remapExplicitSkillInvocations({
        sourceText: "$review this",
        outgoingText: "$review this",
        invocations: [{ name: "review", start: 1, end: 8 }],
      }),
    ).toEqual([]);
  });

  it("moves untouched ranges and drops edited tokens", () => {
    const moved = updateExplicitSkillInvocationsForTextEdit({
      previousText: "$review then $test",
      nextText: "please $review then $test",
      invocations: [
        { name: "review", start: 0, end: 7 },
        { name: "test", start: 13, end: 18 },
      ],
    });
    expect(moved).toEqual([
      { name: "review", start: 7, end: 14 },
      { name: "test", start: 20, end: 25 },
    ]);
    expect(
      updateExplicitSkillInvocationsForTextEdit({
        previousText: "please $review then $test",
        nextText: "please $review then $best",
        invocations: moved,
      }),
    ).toEqual([{ name: "review", start: 7, end: 14 }]);
  });
});
