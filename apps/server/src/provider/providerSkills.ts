import type {
  ProjectId,
  ProviderInstanceId,
  ProviderSkillsListInput,
  ProviderSkillsListResult,
  ServerProviderSkill,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

interface ProviderSkillsProject {
  readonly id: ProjectId;
  readonly workspaceRoot: string;
}

interface ProviderSkillsThread {
  readonly projectId: ProjectId;
  readonly worktreePath: string | null;
}

interface ProviderSkillsSource {
  readonly fallbackSkills: ReadonlyArray<ServerProviderSkill>;
  readonly listSkillsForCwd?: (
    cwd: string,
  ) => Effect.Effect<Option.Option<ReadonlyArray<ServerProviderSkill>>>;
}

export interface ProviderSkillsQueryDependencies {
  readonly getProvider: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderSkillsSource | undefined>;
  readonly getProject: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<ProviderSkillsProject>>;
  readonly getThread: (threadId: ThreadId) => Effect.Effect<Option.Option<ProviderSkillsThread>>;
}

const providerSnapshotResult = (
  skills: ReadonlyArray<ServerProviderSkill>,
): ProviderSkillsListResult => ({
  source: "providerSnapshot",
  skills,
});

export const queryProviderSkills = Effect.fn("queryProviderSkills")(function* (
  input: ProviderSkillsListInput,
  dependencies: ProviderSkillsQueryDependencies,
): Effect.fn.Return<ProviderSkillsListResult> {
  const provider = yield* dependencies.getProvider(input.instanceId);
  if (!provider) {
    return providerSnapshotResult([]);
  }
  if (!provider.listSkillsForCwd) {
    return providerSnapshotResult(provider.fallbackSkills);
  }

  const project = yield* dependencies.getProject(input.projectId);
  if (Option.isNone(project)) {
    return providerSnapshotResult(provider.fallbackSkills);
  }

  let cwd = project.value.workspaceRoot;
  if (input.threadId) {
    const thread = yield* dependencies.getThread(input.threadId);
    if (Option.isSome(thread) && thread.value.projectId === input.projectId) {
      cwd = thread.value.worktreePath ?? cwd;
    }
  }

  const skills = yield* provider.listSkillsForCwd(cwd);
  if (Option.isNone(skills)) {
    return providerSnapshotResult(provider.fallbackSkills);
  }
  return {
    source: "workspace",
    skills: skills.value,
  };
});
