export interface ExplicitSkillInvocationRange {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

export function remapExplicitSkillInvocations<T extends ExplicitSkillInvocationRange>(input: {
  readonly sourceText: string;
  readonly outgoingText: string;
  readonly invocations: ReadonlyArray<T>;
}): T[] {
  if (input.invocations.length === 0) return [];

  const trimmedSource = input.sourceText.trim();
  const leadingTrim = input.sourceText.length - input.sourceText.trimStart().length;
  const prefixLength = input.outgoingText.length - trimmedSource.length;
  if (!input.outgoingText.endsWith(trimmedSource) || prefixLength < 0) return [];

  return input.invocations.flatMap((invocation) => {
    if (input.sourceText.slice(invocation.start, invocation.end) !== `$${invocation.name}`) {
      return [];
    }
    const start = invocation.start - leadingTrim + prefixLength;
    const end = invocation.end - leadingTrim + prefixLength;
    return start < prefixLength || end > input.outgoingText.length
      ? []
      : [{ ...invocation, start, end }];
  });
}

export function updateExplicitSkillInvocationsForTextEdit<
  T extends ExplicitSkillInvocationRange,
>(input: {
  readonly previousText: string;
  readonly nextText: string;
  readonly invocations: ReadonlyArray<T>;
}): T[] {
  let prefixLength = 0;
  while (
    prefixLength < input.previousText.length &&
    prefixLength < input.nextText.length &&
    input.previousText[prefixLength] === input.nextText[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < input.previousText.length - prefixLength &&
    suffixLength < input.nextText.length - prefixLength &&
    input.previousText[input.previousText.length - 1 - suffixLength] ===
      input.nextText[input.nextText.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const previousChangeEnd = input.previousText.length - suffixLength;
  const delta = input.nextText.length - input.previousText.length;
  return input.invocations.flatMap((invocation) => {
    const candidate =
      invocation.end <= prefixLength
        ? invocation
        : invocation.start >= previousChangeEnd
          ? { ...invocation, start: invocation.start + delta, end: invocation.end + delta }
          : null;
    return candidate &&
      input.nextText.slice(candidate.start, candidate.end) === `$${candidate.name}`
      ? [candidate]
      : [];
  });
}
