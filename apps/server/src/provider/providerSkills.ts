import type {
  ProviderSkillsListInput,
  ProviderSkillsListResult,
  ServerProviderSkill,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ProviderInstanceRegistry from "./Services/ProviderInstanceRegistry.ts";

const providerSnapshotResult = (
  skills: ReadonlyArray<ServerProviderSkill>,
): ProviderSkillsListResult => ({
  source: "providerSnapshot",
  skills,
});

export const queryProviderSkills = Effect.fn("queryProviderSkills")(function* (
  input: ProviderSkillsListInput,
): Effect.fn.Return<
  ProviderSkillsListResult,
  never,
  | ProjectionSnapshotQuery.ProjectionSnapshotQuery
  | ProviderInstanceRegistry.ProviderInstanceRegistry
> {
  const providerRegistry = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
  const snapshotQuery = yield* ProjectionSnapshotQuery.ProjectionSnapshotQuery;
  const instance = yield* providerRegistry.getInstance(input.instanceId);
  if (!instance) {
    return providerSnapshotResult([]);
  }
  const fallbackSkills = (yield* instance.snapshot.getSnapshot).skills;
  if (!instance.listSkillsForCwd) {
    return providerSnapshotResult(fallbackSkills);
  }

  const project = yield* snapshotQuery
    .getProjectShellById(input.projectId)
    .pipe(Effect.orElseSucceed(() => Option.none()));
  if (Option.isNone(project)) {
    return providerSnapshotResult(fallbackSkills);
  }

  let cwd = project.value.workspaceRoot;
  if (input.threadId) {
    const thread = yield* snapshotQuery
      .getThreadShellById(input.threadId)
      .pipe(Effect.orElseSucceed(() => Option.none()));
    if (Option.isSome(thread) && thread.value.projectId === input.projectId) {
      cwd = thread.value.worktreePath ?? cwd;
    }
  }

  const skills = yield* instance.listSkillsForCwd(cwd);
  if (Option.isNone(skills)) {
    return providerSnapshotResult(fallbackSkills);
  }
  return {
    source: "workspace",
    skills: skills.value,
  };
});
