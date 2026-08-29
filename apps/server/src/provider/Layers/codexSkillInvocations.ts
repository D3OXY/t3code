import type { ExplicitSkillInvocation, ServerProviderSkill } from "@t3tools/contracts";
import { resolveProviderSkillInvocations } from "../skillInvocations.ts";

export type CodexSkillUserInput = {
  readonly type: "skill";
  readonly name: string;
  readonly path: string;
};

export type BindCodexSkillInvocationsResult =
  | { readonly ok: true; readonly inputs: ReadonlyArray<CodexSkillUserInput> }
  | { readonly ok: false; readonly names: readonly string[] };

export function bindCodexSkillInvocations(
  prompt: string,
  invocations: ReadonlyArray<ExplicitSkillInvocation>,
  skills: ReadonlyArray<Pick<ServerProviderSkill, "name" | "path" | "enabled">>,
): BindCodexSkillInvocationsResult {
  if (invocations.length === 0) {
    return { ok: true, inputs: [] };
  }

  // Codex reports skills disabled for model invocation as disabled. Users can
  // still invoke those skills explicitly.
  const resolution = resolveProviderSkillInvocations(prompt, invocations, skills, {
    allowDisabled: true,
  });
  const failedNames = [...new Set([...resolution.invalidNames, ...resolution.unknownNames])];
  if (failedNames.length > 0) {
    return { ok: false, names: failedNames };
  }
  return {
    ok: true,
    inputs: resolution.references.map((skill) => ({
      type: "skill",
      name: skill.name,
      path: skill.path,
    })),
  };
}
