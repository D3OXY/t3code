import type { ThreadPendingUserInput } from "@t3tools/client-runtime/state/thread-requests";
import { Check, MessageCircleQuestion } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Button } from "~/components/ui/Button";
import { cn } from "~/lib/cn";
import {
  buildQuestionAnswers,
  firstUnansweredQuestionIndex,
  optionValue,
  resolveQuestionAnswer,
  setQuestionCustomAnswer,
  toggleQuestionOption,
  type QuestionDraftAnswers,
} from "./pendingUserInput";

const AUTO_ADVANCE_MS = 220;

interface WizardState {
  readonly index: number;
  readonly drafts: QuestionDraftAnswers;
}

// Answers in progress survive switching threads and remounts until submitted.
const wizardCache = new Map<string, WizardState>();

/**
 * Replaces the composer while the agent asks questions: one page per
 * question, options numbered 1–9 (number keys pick), single-select advancing
 * on its own, multi-select checkboxes, and a free-text answer where allowed.
 * Render it keyed by request id.
 */
export function QuestionPanel({
  request,
  pendingCount,
  onSubmit,
  onDismiss,
}: {
  readonly request: ThreadPendingUserInput;
  readonly pendingCount: number;
  readonly onSubmit: (answers: Record<string, string | string[]>) => Promise<boolean>;
  readonly onDismiss: () => Promise<void>;
}) {
  const { questions, requestId } = request;
  const [state, setStateRaw] = useState<WizardState>(
    () =>
      wizardCache.get(requestId) ?? {
        index: firstUnansweredQuestionIndex(questions, {}),
        drafts: {},
      },
  );
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const advanceTimerRef = useRef<number | null>(null);
  const answerable = request.responseCapability !== "not_resumable";

  const setState = (update: (current: WizardState) => WizardState) =>
    setStateRaw((current) => {
      const next = update(current);
      wizardCache.set(requestId, next);
      return next;
    });

  const index = Math.min(state.index, Math.max(questions.length - 1, 0));
  const question = questions[index];
  const draft = question ? state.drafts[question.id] : undefined;
  const isLast = index >= questions.length - 1;
  const canAdvance = question ? resolveQuestionAnswer(question, draft) !== null : false;
  const answers = buildQuestionAnswers(questions, state.drafts);

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const goTo = (next: number) => {
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = null;
    setState((current) => ({
      ...current,
      index: Math.min(Math.max(next, 0), questions.length - 1),
    }));
  };

  const submit = async () => {
    if (!answers || busy || !answerable) return;
    setBusy(true);
    const ok = await onSubmit(answers);
    setBusy(false);
    if (ok) wizardCache.delete(requestId);
  };

  const pick = (value: string) => {
    if (!question || !answerable) return;
    setState((current) => ({
      ...current,
      drafts: {
        ...current.drafts,
        [question.id]: toggleQuestionOption(question, current.drafts[question.id], value),
      },
    }));
    if (question.multiSelect) return;
    if (advanceTimerRef.current !== null) window.clearTimeout(advanceTimerRef.current);
    advanceTimerRef.current = window.setTimeout(() => {
      advanceTimerRef.current = null;
      if (isLast) submitRef.current?.focus();
      else goTo(index + 1);
    }, AUTO_ADVANCE_MS);
  };

  const onWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      !question ||
      event.defaultPrevented ||
      event.isComposing ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest("input, textarea, [contenteditable=true], [role=menu], [role=dialog]"))
      return;
    const digit = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
    const option = digit >= 0 ? question.options[digit] : undefined;
    if (option) {
      event.preventDefault();
      pick(optionValue(option));
    } else if (event.key === "Enter" && target?.tagName !== "BUTTON") {
      event.preventDefault();
      if (!isLast && canAdvance) goTo(index + 1);
      else if (isLast) void submit();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, []);

  if (!question) return null;
  const selected = new Set(draft?.selectedOptionValues ?? []);
  const allowCustom = question.allowCustomAnswer !== false;

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="group"
      aria-label="The agent has a question"
      className="glass animate-fade-in rounded-2xl border border-line-strong p-4 shadow-[0_12px_40px_-16px_rgb(0_0_0/0.35)] outline-none"
    >
      <div className="flex items-center gap-2 text-[12.5px]">
        <MessageCircleQuestion className="size-4 text-info" />
        <span className="truncate font-medium text-info">{question.header}</span>
        <span className="ml-auto flex items-center gap-2 text-faint tabular-nums">
          {questions.length > 1 ? `${index + 1}/${questions.length}` : null}
          {pendingCount > 1 ? <span>· {pendingCount} waiting</span> : null}
        </span>
      </div>
      <div className="mt-2 text-[14px] leading-snug font-medium">{question.question}</div>
      {question.multiSelect ? (
        <div className="mt-0.5 text-[11.5px] text-faint">Choose any that apply</div>
      ) : null}

      <div
        className="mt-3 flex flex-col gap-1"
        role={question.multiSelect ? "group" : "radiogroup"}
      >
        {question.options.map((option, optionIndex) => {
          const value = optionValue(option);
          const isSelected = selected.has(value);
          return (
            <button
              key={value}
              type="button"
              role={question.multiSelect ? "checkbox" : "radio"}
              aria-checked={isSelected}
              disabled={!answerable}
              onClick={() => pick(value)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50",
                isSelected ? "border-accent/50 bg-accent/10" : "border-line hover:bg-hover",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center text-[11px] font-semibold",
                  question.multiSelect ? "rounded-md" : "rounded-full",
                  isSelected ? "bg-accent text-accent-fg" : "border border-line-strong text-muted",
                )}
              >
                {isSelected ? (
                  <Check className="size-3" />
                ) : optionIndex < 9 ? (
                  optionIndex + 1
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{option.label}</span>
                {option.description ? (
                  <span className="block text-[12px] leading-snug text-muted">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {allowCustom ? (
        <input
          value={draft?.customAnswer ?? ""}
          disabled={!answerable}
          onChange={(event) => {
            const text = event.target.value;
            setState((current) => ({
              ...current,
              drafts: {
                ...current.drafts,
                [question.id]: setQuestionCustomAnswer(current.drafts[question.id], text),
              },
            }));
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (!isLast && canAdvance) goTo(index + 1);
            else if (isLast) void submit();
          }}
          placeholder={
            question.options.length > 0 ? "Or type your own answer…" : "Type your answer…"
          }
          aria-label="Your own answer"
          className="mt-2 h-9 w-full rounded-xl border border-line bg-transparent px-3 text-[13px] outline-none placeholder:text-faint focus:border-line-strong disabled:opacity-50"
        />
      ) : null}

      {!answerable ? (
        <div className="mt-3 text-[12.5px] text-warning">
          The provider process is gone, so this question can't be answered. Stop or restart the run.
        </div>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {request.dismissible ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onDismiss().finally(() => setBusy(false));
            }}
          >
            Dismiss
          </Button>
        ) : null}
        <div className="flex-1" />
        {index > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => goTo(index - 1)}>
            Back
          </Button>
        ) : null}
        {isLast ? (
          <Button
            ref={submitRef}
            size="sm"
            variant="primary"
            disabled={!answers || busy || !answerable}
            onClick={() => void submit()}
          >
            {busy ? "Sending…" : "Submit"}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={!canAdvance}
            onClick={() => goTo(index + 1)}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
