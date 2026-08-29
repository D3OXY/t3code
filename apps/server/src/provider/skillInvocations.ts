import type {
  ExplicitSkillInvocation,
  ProviderDriverKind,
  ServerProviderSkill,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import { ProviderAdapterValidationError } from "./Errors.ts";

export type ProviderSkillReference = Pick<ServerProviderSkill, "name" | "path" | "enabled">;

export interface ProviderSkillDocument {
  readonly name: string;
  readonly path: string;
  readonly contents: string;
}

export interface ProviderSkillInvocationResolution {
  readonly references: ReadonlyArray<ProviderSkillReference>;
  readonly invocations: ReadonlyArray<ExplicitSkillInvocation>;
  readonly unknownNames: ReadonlyArray<string>;
  readonly invalidNames: ReadonlyArray<string>;
}

export function replaceExplicitSkillInvocations(
  prompt: string,
  invocations: ReadonlyArray<ExplicitSkillInvocation>,
  replace: (name: string) => string,
): string {
  let result = prompt;
  for (const invocation of invocations.toReversed()) {
    result = `${result.slice(0, invocation.start)}${replace(invocation.name)}${result.slice(invocation.end)}`;
  }
  return result;
}

export function loadProviderSkillDocuments<E>(
  references: ReadonlyArray<ProviderSkillReference>,
  readFile: (path: string) => Effect.Effect<string, E>,
): Effect.Effect<ReadonlyArray<ProviderSkillDocument>, E> {
  return Effect.forEach(references, (reference) =>
    readFile(reference.path).pipe(
      Effect.map(
        (contents): ProviderSkillDocument => ({
          name: reference.name,
          path: reference.path,
          contents,
        }),
      ),
    ),
  );
}

export function findProviderSkill(
  name: string,
  skills: ReadonlyArray<ProviderSkillReference>,
  options?: { readonly allowDisabled?: boolean },
): ProviderSkillReference | undefined {
  const candidates = options?.allowDisabled ? skills : skills.filter((skill) => skill.enabled);
  const exact = candidates.find((skill) => skill.name === name);
  if (exact) {
    return exact;
  }

  const lowerName = name.toLowerCase();
  return candidates.find((skill) => skill.name.toLowerCase() === lowerName);
}

export function resolveProviderSkillInvocations(
  prompt: string,
  invocations: ReadonlyArray<ExplicitSkillInvocation>,
  skills: ReadonlyArray<ProviderSkillReference>,
  options?: { readonly allowDisabled?: boolean },
): ProviderSkillInvocationResolution {
  const references: ProviderSkillReference[] = [];
  const validInvocations: ExplicitSkillInvocation[] = [];
  const unknownNames: string[] = [];
  const invalidNames: string[] = [];
  const seenPaths = new Set<string>();
  let previousEnd = 0;

  for (const invocation of invocations) {
    const expectedToken = `$${invocation.name}`;
    const validRange =
      invocation.start >= previousEnd &&
      invocation.end > invocation.start &&
      prompt.slice(invocation.start, invocation.end) === expectedToken;
    if (!validRange) {
      if (!invalidNames.includes(invocation.name)) {
        invalidNames.push(invocation.name);
      }
      continue;
    }
    previousEnd = invocation.end;

    const skill = findProviderSkill(invocation.name, skills, options);
    if (!skill) {
      if (!unknownNames.includes(invocation.name)) {
        unknownNames.push(invocation.name);
      }
      continue;
    }
    validInvocations.push(invocation);
    if (!seenPaths.has(skill.path)) {
      seenPaths.add(skill.path);
      references.push(skill);
    }
  }

  return { references, invocations: validInvocations, unknownNames, invalidNames };
}

export function loadInvokedSkills<E>(input: {
  readonly provider: ProviderDriverKind;
  readonly providerLabel: string;
  readonly prompt: string;
  readonly invocations: ReadonlyArray<ExplicitSkillInvocation>;
  readonly skills: ReadonlyArray<ProviderSkillReference>;
  readonly readFile: (path: string) => Effect.Effect<string, E>;
}): Effect.Effect<
  {
    readonly documents: ReadonlyArray<ProviderSkillDocument>;
    readonly invocations: ReadonlyArray<ExplicitSkillInvocation>;
  },
  E | ProviderAdapterValidationError
> {
  const resolution = resolveProviderSkillInvocations(input.prompt, input.invocations, input.skills);
  if (resolution.invalidNames.length > 0) {
    return Effect.fail(
      new ProviderAdapterValidationError({
        provider: input.provider,
        operation: "sendTurn",
        issue: `Invalid explicit ${input.providerLabel} skill invocation metadata for: ${resolution.invalidNames.map((name) => `$${name}`).join(", ")}.`,
      }),
    );
  }
  if (resolution.unknownNames.length > 0) {
    return Effect.fail(
      new ProviderAdapterValidationError({
        provider: input.provider,
        operation: "sendTurn",
        issue: `Unknown ${input.providerLabel} skill${resolution.unknownNames.length === 1 ? "" : "s"}: ${resolution.unknownNames.map((name) => `$${name}`).join(", ")}.`,
      }),
    );
  }
  return loadProviderSkillDocuments(resolution.references, input.readFile).pipe(
    Effect.map((documents) => ({ documents, invocations: resolution.invocations })),
  );
}

/**
 * Makes a provider-neutral skill document part of the turn without leaving a
 * `$skill` token for the provider to reinterpret as a model-invoked tool.
 */
export function renderProviderSkillPrompt(
  prompt: string,
  documents: ReadonlyArray<ProviderSkillDocument>,
  invocations: ReadonlyArray<ExplicitSkillInvocation>,
): string {
  if (documents.length === 0) {
    return prompt;
  }

  const documentsByName = new Map<string, ProviderSkillDocument>();
  for (const document of documents) {
    documentsByName.set(document.name, document);
    documentsByName.set(document.name.toLowerCase(), document);
  }

  const promptWithoutTokens = replaceExplicitSkillInvocations(prompt, invocations, (name) => {
    const document = documentsByName.get(name) ?? documentsByName.get(name.toLowerCase());
    return document ? `[T3 explicitly invoked skill: ${document.name}]` : `$${name}`;
  });
  const skillContext = documents
    .map(
      (document) =>
        `<t3-explicit-skill>\nname: ${document.name}\nfile: ${document.path}\n${document.contents.trim()}\n</t3-explicit-skill>`,
    )
    .join("\n\n");

  return `The user explicitly invoked the skills below. Follow their instructions. Resolve relative file references from the parent directory of each skill file.\n\n${skillContext}\n\n${promptWithoutTokens}`;
}
