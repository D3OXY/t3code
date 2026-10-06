import type { ThreadUserInputQuestion } from "@t3tools/client-runtime/state/thread-requests";

type Question = Pick<
  ThreadUserInputQuestion,
  "id" | "options" | "multiSelect" | "allowCustomAnswer"
>;

export interface QuestionDraftAnswer {
  readonly selectedOptionValues?: ReadonlyArray<string>;
  readonly customAnswer?: string;
}

export type QuestionDraftAnswers = Readonly<Record<string, QuestionDraftAnswer>>;

/** The value an option answers with: its explicit value, else its label. */
export const optionValue = (option: Question["options"][number]) => option.value ?? option.label;

const uniqueValues = (values: ReadonlyArray<string> | undefined): string[] =>
  // Provider option ids must stay byte-for-byte, including whitespace.
  Array.from(new Set(values ?? []));

/** The answer a draft resolves to, or null while the question is unanswered. */
export function resolveQuestionAnswer(
  question: Question,
  draft: QuestionDraftAnswer | undefined,
): string | string[] | null {
  const custom = question.allowCustomAnswer === false ? "" : (draft?.customAnswer?.trim() ?? "");
  if (custom !== "") return custom;
  const selected = uniqueValues(draft?.selectedOptionValues).filter((value) =>
    question.options.some((option) => optionValue(option) === value),
  );
  if (question.multiSelect) return selected.length > 0 ? selected : null;
  return selected[0] ?? null;
}

/** Typing a custom answer clears selected options; clearing it brings them back. */
export function setQuestionCustomAnswer(
  draft: QuestionDraftAnswer | undefined,
  customAnswer: string,
): QuestionDraftAnswer {
  const selected = customAnswer.trim() === "" ? uniqueValues(draft?.selectedOptionValues) : [];
  return selected.length > 0 ? { customAnswer, selectedOptionValues: selected } : { customAnswer };
}

/** Single-select replaces the choice; multi-select toggles it. Either clears the custom answer. */
export function toggleQuestionOption(
  question: Question,
  draft: QuestionDraftAnswer | undefined,
  value: string,
): QuestionDraftAnswer {
  if (!question.multiSelect) return { customAnswer: "", selectedOptionValues: [value] };
  const selected = uniqueValues(draft?.selectedOptionValues);
  const next = selected.includes(value)
    ? selected.filter((entry) => entry !== value)
    : [...selected, value];
  return next.length > 0 ? { customAnswer: "", selectedOptionValues: next } : { customAnswer: "" };
}

/** The response payload, or null until every question has an answer. */
export function buildQuestionAnswers(
  questions: ReadonlyArray<Question>,
  drafts: QuestionDraftAnswers,
): Record<string, string | string[]> | null {
  const answers: Record<string, string | string[]> = {};
  for (const question of questions) {
    const answer = resolveQuestionAnswer(question, drafts[question.id]);
    if (answer === null) return null;
    answers[question.id] = answer;
  }
  return answers;
}

/** Where a reopened wizard should land: the first unanswered question, else the last. */
export function firstUnansweredQuestionIndex(
  questions: ReadonlyArray<Question>,
  drafts: QuestionDraftAnswers,
): number {
  const index = questions.findIndex(
    (question) => resolveQuestionAnswer(question, drafts[question.id]) === null,
  );
  return index === -1 ? Math.max(questions.length - 1, 0) : index;
}
