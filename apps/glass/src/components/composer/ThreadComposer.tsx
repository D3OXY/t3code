import { useAtomValue } from "@effect/atom-react";
import { resolveComposerDispatchMode } from "@t3tools/client-runtime/state/composer-dispatch";
import {
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { threadRuntimeHasInterruptibleRun } from "@t3tools/client-runtime/state/thread-execution";
import { threadSupportsProviderHandoff } from "@t3tools/client-runtime/state/thread-workflows";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  type ModelSelection,
  type ProviderApprovalDecision,
} from "@t3tools/contracts";
import { modelSelectionsEqual } from "@t3tools/shared/model";

import { useEnvironmentProviders } from "~/components/ui/ProviderIcon";
import { cn } from "~/lib/cn";
import {
  environmentThreadDetails,
  environmentThreadShells,
  threadEnvironment,
} from "~/state/atoms";
import { commandFailureMessage, useAtomCommand } from "~/state/hooks";
import { appAtomRegistry } from "~/state/registry";
import { sessionKey } from "~/state/sessions";
import { useComposerPrefs } from "~/stores/composerPrefs";
import { useDraftSettings, useDrafts } from "~/stores/drafts";
import type { ThreadTab } from "~/stores/tabs";
import { showToast } from "~/stores/toasts";
import { ApprovalPanel } from "./ApprovalPanel";
import { resolveTurnAttachments } from "./attachments";
import { ComposerCard, type ComposerSubmission } from "./ComposerCard";
import { randomUUID } from "./ids";
import { ModeMenu } from "./ModeMenu";
import { ModelPicker } from "./ModelPicker";
import { modelSwitchBlockReason } from "./modelSelection";
import { QuestionPanel } from "./QuestionPanel";
import { QueuedRuns } from "./QueuedRuns";

const hasStarted = (shell: EnvironmentThreadShell) =>
  shell.latestRun !== null || shell.latestUserMessageAt !== null || shell.runtime !== null;

/**
 * The composer docked under a thread transcript: send / steer / stop, model and
 * trait pickers, attachments, queued runs, and the approval / question panels
 * that replace it while the agent is blocked on the user.
 */
export function ThreadComposer({ threadRef }: { readonly threadRef: ThreadTab }) {
  const { environmentId, threadId } = threadRef;
  const shell = useAtomValue(environmentThreadShells.threadShellAtom(threadRef));
  const pending = useAtomValue(environmentThreadDetails.pendingRequestsAtom(threadRef));
  const workflow = useAtomValue(environmentThreadDetails.queueWorkflowAtom(threadRef));
  const draftKey = sessionKey(environmentId, threadId);
  const draft = useDraftSettings(draftKey);
  const updateDraft = useDrafts((state) => state.update);
  const followUpBehavior = useComposerPrefs((state) => state.followUpBehavior);
  const providers = useEnvironmentProviders(environmentId);

  const startTurn = useAtomCommand(threadEnvironment.startTurn);
  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn);
  const setRuntimeMode = useAtomCommand(threadEnvironment.setRuntimeMode);
  const setInteractionMode = useAtomCommand(threadEnvironment.setInteractionMode);
  const respondToApproval = useAtomCommand(threadEnvironment.respondToApproval);
  const respondToUserInput = useAtomCommand(threadEnvironment.respondToUserInput);
  const dismissUserInput = useAtomCommand(threadEnvironment.dismissUserInput);

  const modelSelection = draft.modelSelection ?? shell?.modelSelection ?? null;
  const runtimeMode = draft.runtimeMode ?? shell?.runtimeMode ?? DEFAULT_RUNTIME_MODE;
  const interactionMode =
    draft.interactionMode ?? shell?.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE;
  const running = threadRuntimeIsActive(shell?.runtime);
  const canStop = threadRuntimeHasInterruptibleRun(shell?.runtime);
  const provider =
    providers.find((entry) => entry.instanceId === modelSelection?.instanceId) ?? null;
  const approval = pending?.approvals[0] ?? null;
  const question = approval ? null : (pending?.userInputs[0] ?? null);
  const pendingCount = (pending?.approvals.length ?? 0) + (pending?.userInputs.length ?? 0);

  const modelBlockReason = (next: Pick<ModelSelection, "instanceId" | "model">) => {
    if (!shell) return null;
    // Read the projection only when asked, instead of re-rendering on every thread event.
    const projection = appAtomRegistry.get(
      environmentThreadDetails.threadAtom(threadRef),
    )?.projection;
    return modelSwitchBlockReason({
      providers,
      hasStarted: hasStarted(shell),
      supportsProviderHandoff: threadSupportsProviderHandoff(projection),
      current: {
        ...shell.modelSelection,
        instanceId: shell.runtime?.providerInstanceId ?? shell.modelSelection.instanceId,
      },
      next,
    });
  };

  const report = (result: Parameters<typeof commandFailureMessage>[0]) => {
    const message = commandFailureMessage(result);
    if (message) showToast(message);
    return result._tag === "Success";
  };

  const onSubmit = async ({ text, attachments, alternate }: ComposerSubmission) => {
    if (!shell) return "This session is still loading.";
    const createdAt = new Date().toISOString();
    // Mode changes apply to the thread before the turn that should use them.
    if (runtimeMode !== shell.runtimeMode) {
      const result = await setRuntimeMode({
        environmentId,
        input: { threadId, runtimeMode, createdAt },
      });
      if (result._tag === "Failure")
        return commandFailureMessage(result) ?? "Couldn't change access.";
    }
    if (interactionMode !== shell.interactionMode) {
      const result = await setInteractionMode({
        environmentId,
        input: { threadId, interactionMode, createdAt },
      });
      if (result._tag === "Failure")
        return commandFailureMessage(result) ?? "Couldn't change plan mode.";
    }
    let turnAttachments: Awaited<ReturnType<typeof resolveTurnAttachments>>;
    try {
      turnAttachments = await resolveTurnAttachments(environmentId, attachments);
    } catch (error) {
      return error instanceof Error ? error.message : "Attachments couldn't be sent.";
    }
    const nextModel =
      draft.modelSelection && !modelSelectionsEqual(draft.modelSelection, shell.modelSelection)
        ? draft.modelSelection
        : null;
    const result = await startTurn({
      environmentId,
      input: {
        threadId,
        message: {
          messageId: MessageId.make(randomUUID()),
          role: "user",
          text,
          attachments: turnAttachments,
        },
        ...(nextModel ? { modelSelection: nextModel } : {}),
        runtimeMode,
        interactionMode,
        dispatchMode: resolveComposerDispatchMode({
          running,
          alternateModifier: alternate,
          activeTurnDefault: followUpBehavior,
        }),
        createdAt,
      },
    });
    if (result._tag === "Failure") return commandFailureMessage(result) ?? "Sending was cancelled.";
    // The thread now carries these settings; stop overriding them.
    updateDraft(draftKey, { modelSelection: null, runtimeMode: null, interactionMode: null });
    return null;
  };

  const onStop = () => {
    const runId = shell?.runtime?.activeRunId;
    void interruptTurn({ environmentId, input: { threadId, ...(runId ? { runId } : {}) } }).then(
      report,
    );
  };

  const onRespondToApproval = async (decision: ProviderApprovalDecision) => {
    if (!approval) return;
    report(
      await respondToApproval({
        environmentId,
        input: { threadId, requestId: approval.requestId, decision },
      }),
    );
  };

  const blocked = approval !== null || question !== null;

  return (
    <div className="flex flex-col">
      {approval ? (
        <ApprovalPanel
          key={approval.requestId}
          approval={approval}
          pendingCount={pendingCount}
          onRespond={onRespondToApproval}
        />
      ) : question ? (
        <QuestionPanel
          key={question.requestId}
          request={question}
          pendingCount={pendingCount}
          onSubmit={async (answers) =>
            report(
              await respondToUserInput({
                environmentId,
                input: { threadId, requestId: question.requestId, answers },
              }),
            )
          }
          onDismiss={async () => {
            report(
              await dismissUserInput({
                environmentId,
                input: { threadId, requestId: question.requestId },
              }),
            );
          }}
        />
      ) : null}
      {/* Hidden rather than unmounted while blocked, so the prompt is never remounted. */}
      <div className={cn("flex flex-col", blocked && "hidden")}>
        {workflow ? (
          <QueuedRuns environmentId={environmentId} threadId={threadId} workflow={workflow} />
        ) : null}
        <ComposerCard
          draftKey={draftKey}
          environmentId={environmentId}
          running={running}
          canStop={canStop}
          followUpBehavior={followUpBehavior}
          blockedReason={shell ? null : "This session is still loading."}
          autoFocus
          onSubmit={onSubmit}
          onStop={onStop}
          controls={
            <>
              <ModelPicker
                environmentId={environmentId}
                selection={modelSelection}
                blockReason={modelBlockReason}
                onChange={(next) =>
                  updateDraft(draftKey, {
                    modelSelection:
                      shell && modelSelectionsEqual(next, shell.modelSelection) ? null : next,
                  })
                }
              />
              <ModeMenu
                provider={provider}
                runtimeMode={runtimeMode}
                interactionMode={interactionMode}
                onRuntimeModeChange={(mode) =>
                  updateDraft(draftKey, { runtimeMode: mode === shell?.runtimeMode ? null : mode })
                }
                onInteractionModeChange={(mode) =>
                  updateDraft(draftKey, {
                    interactionMode: mode === shell?.interactionMode ? null : mode,
                  })
                }
              />
            </>
          }
        />
      </div>
    </div>
  );
}
