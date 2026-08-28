import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type ServerProviderSkill,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { queryProviderSkills } from "./providerSkills.ts";

const instanceId = ProviderInstanceId.make("claude-work");
const projectId = ProjectId.make("project-1");
const threadId = ThreadId.make("thread-1");

const fallbackSkill: ServerProviderSkill = {
  name: "global-skill",
  path: "/home/ishan/.claude/skills/global-skill/SKILL.md",
  enabled: true,
  scope: "user",
};

const workspaceSkill: ServerProviderSkill = {
  name: "workspace-skill",
  path: "/worktrees/feature/.claude/skills/workspace-skill/SKILL.md",
  enabled: true,
  scope: "project",
};

function makeDependencies(input: {
  readonly loadSkills: (
    cwd: string,
  ) => Effect.Effect<Option.Option<ReadonlyArray<ServerProviderSkill>>>;
  readonly threadProjectId?: ProjectId;
  readonly worktreePath?: string | null;
}) {
  return {
    getProvider: () =>
      Effect.succeed({
        fallbackSkills: [fallbackSkill],
        listSkillsForCwd: input.loadSkills,
      }),
    getProject: () =>
      Effect.succeed(
        Option.some({
          id: projectId,
          workspaceRoot: "/projects/t3code",
        }),
      ),
    getThread: () =>
      Effect.succeed(
        Option.some({
          projectId: input.threadProjectId ?? projectId,
          worktreePath:
            input.worktreePath === undefined ? "/worktrees/feature" : input.worktreePath,
        }),
      ),
  };
}

it.effect("discovers skills from the thread worktree", () =>
  Effect.gen(function* () {
    let discoveredCwd: string | undefined;
    const result = yield* queryProviderSkills(
      { instanceId, projectId, threadId },
      makeDependencies({
        loadSkills: (cwd) => {
          discoveredCwd = cwd;
          return Effect.succeed(Option.some([workspaceSkill]));
        },
      }),
    );

    assert.strictEqual(discoveredCwd, "/worktrees/feature");
    assert.deepStrictEqual(result, { source: "workspace", skills: [workspaceSkill] });
  }),
);

it.effect("uses the project root when the supplied thread belongs to another project", () =>
  Effect.gen(function* () {
    let discoveredCwd: string | undefined;
    const result = yield* queryProviderSkills(
      { instanceId, projectId, threadId },
      makeDependencies({
        threadProjectId: ProjectId.make("project-2"),
        loadSkills: (cwd) => {
          discoveredCwd = cwd;
          return Effect.succeed(Option.some([]));
        },
      }),
    );

    assert.strictEqual(discoveredCwd, "/projects/t3code");
    assert.deepStrictEqual(result, { source: "workspace", skills: [] });
  }),
);

it.effect("preserves the provider snapshot when scoped discovery fails", () =>
  Effect.gen(function* () {
    const result = yield* queryProviderSkills(
      { instanceId, projectId, threadId },
      makeDependencies({
        loadSkills: () => Effect.succeed(Option.none()),
      }),
    );

    assert.deepStrictEqual(result, {
      source: "providerSnapshot",
      skills: [fallbackSkill],
    });
  }),
);
