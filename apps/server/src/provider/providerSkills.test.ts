import {
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
  type ServerProvider,
  type ServerProviderSkill,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import * as ProjectionSnapshotQuery from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import type { ProviderInstance } from "./ProviderDriver.ts";
import * as ProviderInstanceRegistry from "./Services/ProviderInstanceRegistry.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "./providerMaintenance.ts";
import { queryProviderSkills } from "./providerSkills.ts";

const instanceId = ProviderInstanceId.make("claude-work");
const projectId = ProjectId.make("project-1");
const threadId = ThreadId.make("thread-1");
const driverKind = ProviderDriverKind.make("claudeAgent");
const now = "2026-08-28T00:00:00.000Z";

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

const project = {
  id: projectId,
  title: "T3 Code",
  workspaceRoot: "/projects/t3code",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: now,
  updatedAt: now,
} satisfies OrchestrationProjectShell;

function makeThread(input: {
  readonly projectId: ProjectId;
  readonly worktreePath: string | null;
}): OrchestrationThreadShell {
  return {
    id: threadId,
    projectId: input.projectId,
    title: "Test thread",
    modelSelection: { instanceId, model: "claude-sonnet" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: input.worktreePath,
    latestTurn: null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

function makeLayer(input: {
  readonly loadSkills: (
    cwd: string,
  ) => Effect.Effect<Option.Option<ReadonlyArray<ServerProviderSkill>>>;
  readonly threadProjectId?: ProjectId;
  readonly worktreePath?: string | null;
}) {
  const snapshot = {
    instanceId,
    driver: driverKind,
    status: "ready",
    enabled: true,
    installed: true,
    auth: { status: "authenticated" },
    checkedAt: now,
    version: "1.0.0",
    models: [],
    slashCommands: [],
    skills: [fallbackSkill],
  } satisfies ServerProvider;
  const instance = {
    instanceId,
    driverKind,
    continuationIdentity: {
      driverKind,
      continuationKey: `${driverKind}:instance:${instanceId}`,
    },
    displayName: undefined,
    enabled: true,
    snapshot: {
      maintenanceCapabilities: makeManualOnlyProviderMaintenanceCapabilities({
        provider: driverKind,
        packageName: null,
      }),
      getSnapshot: Effect.succeed(snapshot),
      refresh: Effect.succeed(snapshot),
      streamChanges: Stream.empty,
    },
    listSkillsForCwd: input.loadSkills,
    adapter: {} as ProviderInstance["adapter"],
    textGeneration: {} as ProviderInstance["textGeneration"],
  } satisfies ProviderInstance;

  return Layer.merge(
    Layer.mock(ProviderInstanceRegistry.ProviderInstanceRegistry)({
      getInstance: () => Effect.succeed(instance),
    }),
    Layer.mock(ProjectionSnapshotQuery.ProjectionSnapshotQuery)({
      getProjectShellById: () => Effect.succeed(Option.some(project)),
      getThreadShellById: () =>
        Effect.succeed(
          Option.some(
            makeThread({
              projectId: input.threadProjectId ?? projectId,
              worktreePath:
                input.worktreePath === undefined ? "/worktrees/feature" : input.worktreePath,
            }),
          ),
        ),
    }),
  );
}

it.effect("discovers skills from the thread worktree", () =>
  Effect.gen(function* () {
    let discoveredCwd: string | undefined;
    const result = yield* queryProviderSkills({ instanceId, projectId, threadId }).pipe(
      Effect.provide(
        makeLayer({
          loadSkills: (cwd) => {
            discoveredCwd = cwd;
            return Effect.succeed(Option.some([workspaceSkill]));
          },
        }),
      ),
    );

    assert.strictEqual(discoveredCwd, "/worktrees/feature");
    assert.deepStrictEqual(result, { source: "workspace", skills: [workspaceSkill] });
  }),
);

it.effect("uses the project root when the supplied thread belongs to another project", () =>
  Effect.gen(function* () {
    let discoveredCwd: string | undefined;
    const result = yield* queryProviderSkills({ instanceId, projectId, threadId }).pipe(
      Effect.provide(
        makeLayer({
          threadProjectId: ProjectId.make("project-2"),
          loadSkills: (cwd) => {
            discoveredCwd = cwd;
            return Effect.succeed(Option.some([]));
          },
        }),
      ),
    );

    assert.strictEqual(discoveredCwd, "/projects/t3code");
    assert.deepStrictEqual(result, { source: "workspace", skills: [] });
  }),
);

it.effect("preserves the provider snapshot when scoped discovery fails", () =>
  Effect.gen(function* () {
    const result = yield* queryProviderSkills({ instanceId, projectId, threadId }).pipe(
      Effect.provide(
        makeLayer({
          loadSkills: () => Effect.succeed(Option.none()),
        }),
      ),
    );

    assert.deepStrictEqual(result, {
      source: "providerSnapshot",
      skills: [fallbackSkill],
    });
  }),
);
