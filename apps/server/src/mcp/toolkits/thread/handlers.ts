import {
  CommandId,
  MessageId,
  ThreadId,
  type ModelSelection,
  type OrchestrationCommand,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as BootstrapTurnStartDispatcher from "../../../orchestration/Services/BootstrapTurnStartDispatcher.ts";
import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { GitWorkflowService } from "../../../git/GitWorkflowService.ts";
import * as ServerRuntimeStartup from "../../../serverRuntimeStartup.ts";
import {
  ThreadStartToolError,
  type ThreadStartMode,
  type ThreadStartToolInput,
  type ThreadStartToolOutput,
  ThreadToolkit,
} from "./tools.ts";

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);
const isThreadStartToolError = Schema.is(ThreadStartToolError);

const truncateTitle = (value: string): string => {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length === 0) return "New thread";
  return trimmed.length <= 80 ? trimmed : `${trimmed.slice(0, 77)}...`;
};

const resolveOption = <A>(
  option: Option.Option<A>,
  error: ThreadStartToolError,
): Effect.Effect<A, ThreadStartToolError> =>
  Option.match(option, {
    onNone: () => Effect.fail(error),
    onSome: Effect.succeed,
  });

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

type ActiveThreadStartRuntime = (
  input: ThreadStartToolInput,
  invocation: McpInvocationContext.McpInvocationScope,
) => Effect.Effect<ThreadStartToolOutput, ThreadStartToolError>;

let activeThreadStartRuntime: ActiveThreadStartRuntime | null = null;

const makeActiveThreadStartRuntime = Effect.fn("ThreadToolkit.makeActiveRuntime")(function* () {
  const crypto = yield* Crypto.Crypto;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const gitWorkflow = yield* GitWorkflowService;
  const startup = yield* ServerRuntimeStartup.ServerRuntimeStartup;
  const uuid = () => crypto.randomUUIDv4.pipe(Effect.orDie);

  const makeIds = Effect.fn("ThreadToolkit.makeIds")(function* () {
    return {
      commandId: CommandId.make(yield* uuid()),
      messageId: MessageId.make(yield* uuid()),
      threadId: ThreadId.make(yield* uuid()),
    };
  });

  const makeTemporaryBranchName = Effect.fn("ThreadToolkit.makeTemporaryBranchName")(function* () {
    const bytes = yield* crypto.randomBytes(4).pipe(Effect.orDie);
    return buildTemporaryWorktreeBranchName((byteLength) =>
      byteLength === 4 ? bytesToHex(bytes) : "",
    );
  });

  const resolveCurrentBranch = Effect.fn("ThreadToolkit.resolveCurrentBranch")(function* (
    cwd: string,
  ) {
    return yield* gitWorkflow.status({ cwd }).pipe(
      Effect.map((status) => status.refName),
      Effect.orElseSucceed(() => null),
    );
  });

  const resolveRequiredCurrentBranch = Effect.fn("ThreadToolkit.resolveRequiredCurrentBranch")(
    function* (cwd: string, failureMessage: string) {
      const branch = yield* gitWorkflow.status({ cwd }).pipe(
        Effect.map((status) => status.refName),
        Effect.mapError(
          (cause) =>
            new ThreadStartToolError({
              message: cause instanceof Error ? cause.message : failureMessage,
              operation: "git.status",
              cwd,
              cause,
            }),
        ),
      );
      if (branch) return branch;
      return yield* new ThreadStartToolError({
        message: failureMessage,
        operation: "git.status",
        cwd,
      });
    },
  );

  const resolveDefaultBranch = Effect.fn("ThreadToolkit.resolveDefaultBranch")(function* (
    cwd: string,
  ) {
    return yield* gitWorkflow.listRefs({ cwd, limit: 200 }).pipe(
      Effect.map(
        (result) => result.refs.find((ref) => ref.isDefault && !ref.isRemote)?.name ?? null,
      ),
      Effect.orElseSucceed(() => null),
    );
  });

  const resolveNewWorktreeBaseBranch = Effect.fn("ThreadToolkit.resolveNewWorktreeBaseBranch")(
    function* (
      input: ThreadStartToolInput,
      project: OrchestrationProjectShell,
      sourceThread: OrchestrationThreadShell,
    ) {
      if (input.baseBranch) return input.baseBranch;
      if (input.baseBranchSource === "source" && sourceThread.branch) return sourceThread.branch;

      const defaultBranch = yield* resolveDefaultBranch(project.workspaceRoot);
      if (defaultBranch) return defaultBranch;
      if (sourceThread.branch) return sourceThread.branch;

      const currentBranch = yield* resolveCurrentBranch(project.workspaceRoot);
      if (currentBranch) return currentBranch;

      return yield* new ThreadStartToolError({
        message: "Could not resolve a base branch for the new worktree.",
        operation: "resolve-new-worktree-base-branch",
        cwd: project.workspaceRoot,
        projectId: project.id,
      });
    },
  );

  const resolveInitialBranch = Effect.fn("ThreadToolkit.resolveInitialBranch")(function* (
    mode: ThreadStartMode,
    input: ThreadStartToolInput,
    project: OrchestrationProjectShell,
    sourceThread: OrchestrationThreadShell,
  ) {
    if (input.branch) return input.branch;
    if (mode === "new_worktree") return yield* makeTemporaryBranchName();
    if (mode === "existing_worktree") {
      if (!input.worktreePath) {
        return yield* new ThreadStartToolError({
          message: "existing_worktree mode requires worktreePath.",
          operation: "resolve-initial-branch",
          projectId: project.id,
        });
      }
      return yield* resolveRequiredCurrentBranch(
        input.worktreePath,
        `Could not resolve current branch for existing worktree ${input.worktreePath}.`,
      );
    }
    return (
      sourceThread.branch ??
      (yield* resolveRequiredCurrentBranch(
        sourceThread.worktreePath ?? project.workspaceRoot,
        "Could not resolve current branch for the current checkout.",
      ))
    );
  });

  const loadSourceContext = Effect.fn("ThreadToolkit.loadSourceContext")(function* (
    invocation: McpInvocationContext.McpInvocationScope,
  ) {
    const sourceThread = yield* projectionSnapshotQuery
      .getThreadShellById(invocation.threadId)
      .pipe(
        Effect.flatMap((thread) =>
          resolveOption(
            thread,
            new ThreadStartToolError({
              message: `Source thread ${invocation.threadId} was not found.`,
              operation: "load-source-thread",
              threadId: invocation.threadId,
            }),
          ),
        ),
        Effect.mapError((cause) =>
          isThreadStartToolError(cause)
            ? cause
            : new ThreadStartToolError({
                message: cause instanceof Error ? cause.message : "Failed to load source thread.",
                operation: "load-source-thread",
                threadId: invocation.threadId,
                cause,
              }),
        ),
      );
    const project = yield* projectionSnapshotQuery.getProjectShellById(sourceThread.projectId).pipe(
      Effect.flatMap((project) =>
        resolveOption(
          project,
          new ThreadStartToolError({
            message: `Project ${sourceThread.projectId} was not found.`,
            operation: "load-source-project",
            threadId: sourceThread.id,
            projectId: sourceThread.projectId,
          }),
        ),
      ),
      Effect.mapError((cause) =>
        isThreadStartToolError(cause)
          ? cause
          : new ThreadStartToolError({
              message: cause instanceof Error ? cause.message : "Failed to load source project.",
              operation: "load-source-project",
              threadId: sourceThread.id,
              projectId: sourceThread.projectId,
              cause,
            }),
      ),
    );

    return { sourceThread, project };
  });

  return Effect.fn("ThreadToolkit.startThread")(function* (
    input: ThreadStartToolInput,
    invocation: McpInvocationContext.McpInvocationScope,
  ) {
    const { sourceThread, project } = yield* loadSourceContext(invocation);
    const mode = input.mode ?? "new_worktree";
    const ids = yield* makeIds();
    const createdAt = yield* nowIso;
    const branch = (yield* resolveInitialBranch(mode, input, project, sourceThread)) ?? null;
    const worktreePath: string | null =
      mode === "existing_worktree"
        ? (input.worktreePath ?? null)
        : mode === "current_checkout"
          ? (sourceThread.worktreePath ?? project.workspaceRoot)
          : null;
    const title = input.title ?? truncateTitle(input.prompt);
    const modelSelection = resolveModelSelection(input, sourceThread);
    const runtimeMode = input.runtimeMode ?? sourceThread.runtimeMode;
    const interactionMode = input.interactionMode ?? sourceThread.interactionMode;
    const prepareWorktree =
      mode === "new_worktree"
        ? {
            projectCwd: project.workspaceRoot,
            baseBranch: yield* resolveNewWorktreeBaseBranch(input, project, sourceThread),
            branch: branch ?? undefined,
          }
        : undefined;
    const runSetupScript = input.runSetupScript ?? (mode === "new_worktree" ? true : undefined);

    if (mode === "existing_worktree" && !worktreePath) {
      return yield* new ThreadStartToolError({
        message: "existing_worktree mode requires worktreePath.",
        operation: "start-thread",
        threadId: ids.threadId,
        projectId: project.id,
      });
    }

    const command: Extract<OrchestrationCommand, { type: "thread.turn.start" }> = {
      type: "thread.turn.start",
      commandId: ids.commandId,
      threadId: ids.threadId,
      message: {
        messageId: ids.messageId,
        role: "user",
        text: input.prompt,
        attachments: [],
      },
      modelSelection,
      titleSeed: title,
      runtimeMode,
      interactionMode,
      bootstrap: {
        createThread: {
          projectId: project.id,
          title,
          modelSelection,
          runtimeMode,
          interactionMode,
          branch,
          worktreePath,
          createdAt,
        },
        ...(prepareWorktree ? { prepareWorktree } : {}),
        ...(runSetupScript === undefined ? {} : { runSetupScript }),
      },
      createdAt,
    };

    const result = yield* startup
      .enqueueCommand(BootstrapTurnStartDispatcher.dispatchActive(command))
      .pipe(
        Effect.mapError(
          (cause) =>
            new ThreadStartToolError({
              message: cause instanceof Error ? cause.message : "Failed to start child thread.",
              operation: "start-child-thread",
              threadId: ids.threadId,
              projectId: project.id,
              cause,
            }),
        ),
      );

    return {
      threadId: ids.threadId,
      projectId: project.id,
      mode,
      branch: result.branch ?? branch,
      worktreePath: result.worktreePath,
      ...(mode === "current_checkout"
        ? {
            warning:
              "Child thread was started on the current checkout and may conflict with concurrent writes.",
          }
        : {}),
    };
  });
});

export const ThreadStartRuntimeLive = Layer.effectDiscard(
  Effect.acquireRelease(
    makeActiveThreadStartRuntime().pipe(
      Effect.tap((runtime) =>
        Effect.sync(() => {
          activeThreadStartRuntime = runtime;
        }),
      ),
    ),
    (runtime) =>
      Effect.sync(() => {
        if (activeThreadStartRuntime === runtime) activeThreadStartRuntime = null;
      }),
  ),
);

const resolveModelSelection = (
  input: ThreadStartToolInput,
  sourceThread: OrchestrationThreadShell,
): ModelSelection => input.modelSelection ?? sourceThread.modelSelection;

const startThread = Effect.fn("ThreadToolkit.startThread")(function* (input: ThreadStartToolInput) {
  const invocation = yield* McpInvocationContext.requireMcpCapability("thread-management").pipe(
    Effect.mapError(
      (cause) =>
        new ThreadStartToolError({
          message: cause.message,
          operation: "require-mcp-capability",
          cause,
        }),
    ),
  );
  const runtime = activeThreadStartRuntime;
  if (!runtime) {
    return yield* new ThreadStartToolError({
      message: "Thread start runtime is not available.",
      operation: "start-thread",
    });
  }
  return yield* runtime(input, invocation);
});

const handlers = {
  t3_thread_start: startThread,
} satisfies Parameters<typeof ThreadToolkit.toLayer>[0];

export const ThreadToolkitHandlersLive = ThreadToolkit.toLayer(handlers);
